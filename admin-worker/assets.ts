import type { Env } from "./types";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_REQUEST_BYTES = MAX_MEDIA_BYTES + 512 * 1024;
const MAX_LIST_LIMIT = 60;
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_KEY_PATTERN =
	/^posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:cover|content)-[a-f0-9]{24}\.(?:jpg|png|webp|avif)$/;

const IMAGE_FORMATS = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/avif": "avif",
} as const;

type ImageMime = keyof typeof IMAGE_FORMATS;
type AssetRole = "cover" | "content";

export interface MediaAsset {
	key: string;
	url: string;
	size: number;
	uploaded: string;
	role: AssetRole;
	postSlug: string;
	alt: string;
	originalName: string;
	contentType: string;
	etag: string;
}

export class AssetError extends Error {
	constructor(
		message: string,
		public readonly status = 400,
	) {
		super(message);
		this.name = "AssetError";
	}
}

function readTextField(
	form: FormData,
	name: string,
	maxLength: number,
): string {
	const value = form.get(name);
	if (typeof value !== "string") return "";
	return value.trim().slice(0, maxLength);
}

function validateSlug(slug: string): void {
	if (!SLUG_PATTERN.test(slug)) {
		throw new AssetError("请先填写有效的文章路径，再上传图片");
	}
}

function isImageMime(value: string): value is ImageMime {
	return Object.hasOwn(IMAGE_FORMATS, value);
}

function hasBytes(
	bytes: Uint8Array,
	offset: number,
	expected: number[],
): boolean {
	return expected.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
	return String.fromCharCode(...bytes.subarray(start, end));
}

function matchesDeclaredFormat(bytes: Uint8Array, mime: ImageMime): boolean {
	switch (mime) {
		case "image/jpeg":
			return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
		case "image/png":
			return hasBytes(
				bytes,
				0,
				[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
			);
		case "image/webp":
			return (
				readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 12) === "WEBP"
			);
		case "image/avif": {
			if (readAscii(bytes, 4, 8) !== "ftyp") return false;
			const brands = readAscii(bytes, 8, Math.min(bytes.length, 64));
			return brands.includes("avif") || brands.includes("avis");
		}
	}
}

function bytesToHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function publicAssetUrl(env: Env, request: Request, key: string): string {
	const base =
		env.MEDIA_PUBLIC_BASE_URL?.trim() || `${new URL(request.url).origin}/media`;
	const encodedKey = key.split("/").map(encodeURIComponent).join("/");
	return `${base.replace(/\/+$/, "")}/${encodedKey}`;
}

function roleFromObject(object: R2Object): AssetRole {
	if (object.customMetadata?.role === "cover") return "cover";
	return "content";
}

function assetFromObject(
	object: R2Object,
	env: Env,
	request: Request,
): MediaAsset {
	const pathParts = object.key.split("/");
	return {
		key: object.key,
		url: publicAssetUrl(env, request, object.key),
		size: object.size,
		uploaded: object.uploaded.toISOString(),
		role: roleFromObject(object),
		postSlug: object.customMetadata?.postSlug || pathParts[1] || "",
		alt: object.customMetadata?.alt || "",
		originalName: object.customMetadata?.originalName || "",
		contentType: object.httpMetadata?.contentType || "application/octet-stream",
		etag: object.httpEtag,
	};
}

export async function uploadAsset(
	request: Request,
	env: Env,
	uploadedBy: string,
): Promise<{ asset: MediaAsset }> {
	const contentLength = Number(request.headers.get("Content-Length") ?? "0");
	if (contentLength > MAX_MEDIA_REQUEST_BYTES) {
		throw new AssetError("图片不能超过 10 MB", 413);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw new AssetError("上传请求格式无效");
	}

	const fileEntry = form.get("file");
	if (!(fileEntry instanceof File)) {
		throw new AssetError("请选择要上传的图片");
	}
	if (fileEntry.size === 0) throw new AssetError("图片内容为空");
	if (fileEntry.size > MAX_MEDIA_BYTES) {
		throw new AssetError("图片不能超过 10 MB", 413);
	}

	const postSlug = readTextField(form, "postSlug", 120);
	const roleValue = readTextField(form, "role", 16);
	const alt = readTextField(form, "alt", 240);
	validateSlug(postSlug);
	if (roleValue !== "cover" && roleValue !== "content") {
		throw new AssetError("图片用途无效");
	}
	const role: AssetRole = roleValue;
	if (role === "content" && !alt) {
		throw new AssetError("正文图片需要填写替代文字");
	}

	const declaredMime = fileEntry.type.toLowerCase();
	if (!isImageMime(declaredMime)) {
		throw new AssetError("仅支持 JPEG、PNG、WebP 和 AVIF 图片");
	}

	const buffer = await fileEntry.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	if (!matchesDeclaredFormat(bytes, declaredMime)) {
		throw new AssetError("图片内容与文件格式不一致");
	}

	const digest = await crypto.subtle.digest("SHA-256", buffer);
	const hash = bytesToHex(digest);
	const extension = IMAGE_FORMATS[declaredMime];
	const key = `posts/${postSlug}/${role}-${hash.slice(0, 24)}.${extension}`;
	const uploadedAt = new Date().toISOString();
	const originalName =
		fileEntry.name.trim().slice(0, 180) || `image.${extension}`;

	const object = await env.MEDIA_BUCKET.put(key, buffer, {
		httpMetadata: {
			contentType: declaredMime,
			cacheControl: IMMUTABLE_CACHE,
		},
		customMetadata: {
			postSlug,
			role,
			alt,
			originalName,
			uploadedBy: uploadedBy.slice(0, 80),
			uploadedAt,
		},
		sha256: digest,
	});

	return { asset: assetFromObject(object, env, request) };
}

export async function listAssets(
	request: Request,
	env: Env,
): Promise<{ assets: MediaAsset[]; cursor: string | null }> {
	const url = new URL(request.url);
	const slug = url.searchParams.get("slug")?.trim() || "";
	if (slug) validateSlug(slug);
	const cursor = url.searchParams.get("cursor")?.trim() || undefined;
	if (cursor && cursor.length > 2048) throw new AssetError("分页游标无效");

	const listed = await env.MEDIA_BUCKET.list({
		prefix: slug ? `posts/${slug}/` : "posts/",
		cursor,
		limit: MAX_LIST_LIMIT,
		include: ["httpMetadata", "customMetadata"],
	});

	return {
		assets: listed.objects
			.filter((object) => MEDIA_KEY_PATTERN.test(object.key))
			.sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime())
			.map((object) => assetFromObject(object, env, request)),
		cursor: listed.truncated ? listed.cursor : null,
	};
}

function decodeMediaKey(pathname: string): string | null {
	if (!pathname.startsWith("/media/")) return null;
	try {
		const key = pathname
			.slice("/media/".length)
			.split("/")
			.map(decodeURIComponent)
			.join("/");
		return MEDIA_KEY_PATTERN.test(key) ? key : null;
	} catch {
		return null;
	}
}

function mediaHeaders(object: R2Object): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("Cache-Control", IMMUTABLE_CACHE);
	headers.set("Content-Length", object.size.toString());
	headers.set("ETag", object.httpEtag);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");
	headers.set("X-Content-Type-Options", "nosniff");
	return headers;
}

function missingMediaResponse(): Response {
	return new Response(null, {
		status: 404,
		headers: {
			"Cache-Control": "no-store",
			"Cross-Origin-Resource-Policy": "cross-origin",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

export async function serveAsset(
	request: Request,
	env: Env,
): Promise<Response | null> {
	const key = decodeMediaKey(new URL(request.url).pathname);
	if (!key) return null;

	if (request.method === "HEAD") {
		const object = await env.MEDIA_BUCKET.head(key);
		if (!object) return missingMediaResponse();
		return new Response(null, { status: 200, headers: mediaHeaders(object) });
	}

	const object = await env.MEDIA_BUCKET.get(key);
	if (!object) return missingMediaResponse();
	const headers = mediaHeaders(object);
	if (request.headers.get("If-None-Match") === object.httpEtag) {
		headers.delete("Content-Length");
		return new Response(null, { status: 304, headers });
	}
	return new Response(object.body, { status: 200, headers });
}

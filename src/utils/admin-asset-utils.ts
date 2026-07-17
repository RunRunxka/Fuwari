import type { AdminAsset, AdminAssetList, AdminAssetRole } from "@/types/admin";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_SOURCE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
]);

interface DecodedImage {
	source: CanvasImageSource;
	width: number;
	height: number;
	cleanup: () => void;
}

export class AdminAssetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AdminAssetError";
	}
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const image = new Image();
		image.decoding = "async";
		image.onload = () => {
			resolve({
				source: image,
				width: image.naturalWidth,
				height: image.naturalHeight,
				cleanup: () => URL.revokeObjectURL(objectUrl),
			});
		};
		image.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new AdminAssetError("浏览器无法读取这张图片"));
		};
		image.src = objectUrl;
	});
}

async function decodeImage(file: File): Promise<DecodedImage> {
	if ("createImageBitmap" in window) {
		try {
			const bitmap = await createImageBitmap(file, {
				imageOrientation: "from-image",
			});
			return {
				source: bitmap,
				width: bitmap.width,
				height: bitmap.height,
				cleanup: () => bitmap.close(),
			};
		} catch {
			// Safari versions with partial createImageBitmap support use the fallback.
		}
	}
	return decodeWithImageElement(file);
}

function canvasToWebp(
	canvas: HTMLCanvasElement,
	quality: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new AdminAssetError("浏览器无法压缩这张图片"));
			},
			"image/webp",
			quality,
		);
	});
}

function outputFileName(fileName: string): string {
	const base = fileName.replace(/\.[^.]+$/, "").trim() || "image";
	return `${base.slice(0, 120)}.webp`;
}

export async function prepareAdminAsset(
	file: File,
	role: AdminAssetRole,
): Promise<File> {
	if (!ACCEPTED_SOURCE_TYPES.has(file.type.toLowerCase())) {
		throw new AdminAssetError("仅支持 JPEG、PNG、WebP 和 AVIF 图片");
	}
	if (file.size === 0) throw new AdminAssetError("图片内容为空");
	if (file.size > MAX_SOURCE_BYTES) {
		throw new AdminAssetError("原图不能超过 20 MB");
	}

	const decoded = await decodeImage(file);
	try {
		if (decoded.width <= 0 || decoded.height <= 0) {
			throw new AdminAssetError("图片尺寸无效");
		}
		const maxEdge = role === "cover" ? 1920 : 2560;
		const scale = Math.min(
			1,
			maxEdge / Math.max(decoded.width, decoded.height),
		);
		const width = Math.max(1, Math.round(decoded.width * scale));
		const height = Math.max(1, Math.round(decoded.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d", { alpha: true });
		if (!context) throw new AdminAssetError("浏览器无法处理这张图片");
		context.drawImage(decoded.source, 0, 0, width, height);
		const blob = await canvasToWebp(canvas, role === "cover" ? 0.86 : 0.84);
		if (blob.size > MAX_UPLOAD_BYTES) {
			throw new AdminAssetError("压缩后仍超过 10 MB，请先缩小图片尺寸");
		}
		return new File([blob], outputFileName(file.name), {
			type: "image/webp",
			lastModified: Date.now(),
		});
	} finally {
		decoded.cleanup();
	}
}

function parseApiError(payload: unknown, fallback: string): string {
	if (
		typeof payload === "object" &&
		payload !== null &&
		"error" in payload &&
		typeof payload.error === "string"
	) {
		return payload.error;
	}
	return fallback;
}

export async function fetchAdminAssets(
	apiBase: string,
	sessionToken: string,
	slug = "",
	cursor = "",
): Promise<AdminAssetList> {
	const url = new URL(`${apiBase.replace(/\/+$/, "")}/api/assets`);
	if (slug) url.searchParams.set("slug", slug);
	if (cursor) url.searchParams.set("cursor", cursor);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${sessionToken}` },
	});
	const payload = (await response.json().catch(() => null)) as
		| (AdminAssetList & { error?: string })
		| null;
	if (!response.ok || !payload) {
		throw new AdminAssetError(
			parseApiError(payload, `素材列表加载失败（${response.status}）`),
		);
	}
	return payload;
}

export async function uploadAdminAsset(
	apiBase: string,
	sessionToken: string,
	file: File,
	postSlug: string,
	role: AdminAssetRole,
	alt: string,
): Promise<AdminAsset> {
	const form = new FormData();
	form.set("file", file);
	form.set("postSlug", postSlug);
	form.set("role", role);
	form.set("alt", alt);
	const response = await fetch(`${apiBase.replace(/\/+$/, "")}/api/assets`, {
		method: "POST",
		headers: { Authorization: `Bearer ${sessionToken}` },
		body: form,
	});
	const payload = (await response.json().catch(() => null)) as {
		asset?: AdminAsset;
		error?: string;
	} | null;
	if (!response.ok || !payload?.asset) {
		throw new AdminAssetError(
			parseApiError(payload, `图片上传失败（${response.status}）`),
		);
	}
	return payload.asset;
}

export function formatAssetBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

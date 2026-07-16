import { encodeBase64Url } from "./security";
import type { Env, PublishResult, SessionClaims } from "./types";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 12_000;

interface GitHubErrorBody {
	message?: string;
}

interface GitReference {
	object: { sha: string };
}

interface GitCommit {
	sha: string;
	tree: { sha: string };
}

interface GitObject {
	sha: string;
}

interface PullRequest {
	number: number;
	html_url: string;
}

interface RepositoryContent {
	type: string;
	encoding: string;
	content: string;
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "GitHubApiError";
	}
}

async function githubRequest<T>(
	path: string,
	token: string,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/vnd.github+json");
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("User-Agent", "fuwari-studio-worker");
	headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
	if (init.body) headers.set("Content-Type", "application/json");

	const response = await fetch(`${GITHUB_API_URL}${path}`, {
		...init,
		headers,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		let message = `GitHub API 请求失败（${response.status}）`;
		try {
			const error = (await response.json()) as GitHubErrorBody;
			if (error.message) message = error.message;
		} catch {
			// Keep the status-only message when GitHub does not return JSON.
		}
		throw new GitHubApiError(message, response.status);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

function encodeDerLength(length: number): Uint8Array {
	if (length < 0x80) return Uint8Array.of(length);
	const bytes: number[] = [];
	let remaining = length;
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining >>>= 8;
	}
	return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(
		parts.reduce((total, part) => total + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
	const version = Uint8Array.of(0x02, 0x01, 0x00);
	const rsaAlgorithmIdentifier = Uint8Array.of(
		0x30,
		0x0d,
		0x06,
		0x09,
		0x2a,
		0x86,
		0x48,
		0x86,
		0xf7,
		0x0d,
		0x01,
		0x01,
		0x01,
		0x05,
		0x00,
	);
	const privateKey = concatBytes(
		Uint8Array.of(0x04),
		encodeDerLength(pkcs1.length),
		pkcs1,
	);
	const body = concatBytes(version, rsaAlgorithmIdentifier, privateKey);
	return concatBytes(Uint8Array.of(0x30), encodeDerLength(body.length), body);
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
	const normalized = pem.replace(/\\n/g, "\n");
	const isPkcs1 = normalized.includes("-----BEGIN RSA PRIVATE KEY-----");
	const base64 = normalized
		.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
		.replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return isPkcs1 ? wrapPkcs1InPkcs8(bytes) : bytes;
}

export async function createAppJwt(env: Env): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = encodeBase64Url(
		JSON.stringify({
			iat: now - 60,
			exp: now + 9 * 60,
			iss: env.GITHUB_APP_ID,
		}),
	);
	const signingInput = `${header}.${payload}`;
	const privateKey = await crypto.subtle.importKey(
		"pkcs8",
		pemToPkcs8Bytes(env.GITHUB_APP_PRIVATE_KEY),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		privateKey,
		new TextEncoder().encode(signingInput),
	);
	return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function getInstallationToken(env: Env): Promise<string> {
	const appJwt = await createAppJwt(env);
	const result = await githubRequest<{ token: string }>(
		`/app/installations/${encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID)}/access_tokens`,
		appJwt,
		{
			method: "POST",
			body: JSON.stringify({
				repositories: [env.GITHUB_REPO],
				permissions: {
					contents: "write",
					pull_requests: "write",
				},
			}),
		},
	);
	return result.token;
}

function postPath(slug: string): string {
	return `src/content/posts/${slug}.md`;
}

async function pathExists(
	env: Env,
	token: string,
	slug: string,
	ref: string,
): Promise<boolean> {
	try {
		await githubRequest<unknown>(
			`/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${postPath(slug)}?ref=${encodeURIComponent(ref)}`,
			token,
		);
		return true;
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) return false;
		throw error;
	}
}

async function readPostContent(
	env: Env,
	token: string,
	slug: string,
	ref: string,
): Promise<string> {
	let file: RepositoryContent;
	try {
		file = await githubRequest<RepositoryContent>(
			`/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${postPath(slug)}?ref=${encodeURIComponent(ref)}`,
			token,
		);
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			throw new GitHubApiError(`仓库中不存在文章：${slug}`, 409);
		}
		throw error;
	}
	if (file.type !== "file" || file.encoding !== "base64" || !file.content) {
		throw new GitHubApiError(`无法读取仓库文章：${slug}`, 409);
	}
	const binary = atob(file.content.replace(/\s+/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new TextDecoder().decode(bytes);
}

export function extractPostTitle(content: string): string {
	if (!content.startsWith("---\n")) {
		throw new GitHubApiError("文章必须以 YAML frontmatter 开始", 400);
	}
	const frontmatterEnd = content.indexOf("\n---", 4);
	if (frontmatterEnd === -1) {
		throw new GitHubApiError("文章 frontmatter 未闭合", 400);
	}
	const titleLine = content
		.slice(4, frontmatterEnd)
		.split("\n")
		.find((line) => line.startsWith("title: "));
	if (!titleLine) {
		throw new GitHubApiError("文章 frontmatter 缺少 title", 400);
	}
	try {
		const title = JSON.parse(titleLine.slice("title: ".length));
		if (typeof title !== "string" || !title.trim()) throw new Error();
		return title.replace(/\s+/g, " ").trim().slice(0, 160);
	} catch {
		throw new GitHubApiError("文章 title 必须是有效的 JSON 字符串", 400);
	}
}

async function createDraftPullRequest(
	env: Env,
	token: string,
	baseBranch: string,
	branch: string,
	commitSha: string,
	title: string,
	body: string,
): Promise<PullRequest> {
	const owner = encodeURIComponent(env.GITHUB_OWNER);
	const repo = encodeURIComponent(env.GITHUB_REPO);
	await githubRequest<GitReference>(`/repos/${owner}/${repo}/git/refs`, token, {
		method: "POST",
		body: JSON.stringify({
			ref: `refs/heads/${branch}`,
			sha: commitSha,
		}),
	});

	try {
		return await githubRequest<PullRequest>(
			`/repos/${owner}/${repo}/pulls`,
			token,
			{
				method: "POST",
				body: JSON.stringify({
					title,
					head: branch,
					base: baseBranch,
					draft: true,
					body,
				}),
			},
		);
	} catch (error) {
		try {
			await githubRequest<void>(
				`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
				token,
				{ method: "DELETE" },
			);
		} catch {
			// Leave the exact recovery branch in place if GitHub rejects cleanup.
		}
		throw error;
	}
}

export async function publishPost(
	env: Env,
	actor: SessionClaims,
	slug: string,
	content: string,
	sourceSlug?: string,
): Promise<PublishResult> {
	const title = extractPostTitle(content);
	const token = await getInstallationToken(env);
	const owner = encodeURIComponent(env.GITHUB_OWNER);
	const repo = encodeURIComponent(env.GITHUB_REPO);
	const baseBranch = env.GITHUB_BASE_BRANCH || "main";

	const sourceExists = sourceSlug
		? await pathExists(env, token, sourceSlug, baseBranch)
		: false;
	if (sourceSlug && !sourceExists) {
		throw new GitHubApiError(`仓库中不存在源文章：${sourceSlug}`, 409);
	}

	const targetExists = await pathExists(env, token, slug, baseBranch);
	if (!sourceSlug && targetExists) {
		throw new GitHubApiError(`文章路径已存在：${slug}`, 409);
	}
	if (sourceSlug && sourceSlug !== slug && targetExists) {
		throw new GitHubApiError(`目标文章路径已存在：${slug}`, 409);
	}

	const baseReference = await githubRequest<GitReference>(
		`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
		token,
	);
	const baseCommit = await githubRequest<GitCommit>(
		`/repos/${owner}/${repo}/git/commits/${baseReference.object.sha}`,
		token,
	);
	const blob = await githubRequest<GitObject>(
		`/repos/${owner}/${repo}/git/blobs`,
		token,
		{
			method: "POST",
			body: JSON.stringify({ content, encoding: "utf-8" }),
		},
	);

	const treeEntries: Array<{
		path: string;
		mode: "100644";
		type: "blob";
		sha: string | null;
	}> = [
		{
			path: postPath(slug),
			mode: "100644",
			type: "blob",
			sha: blob.sha,
		},
	];
	if (sourceSlug && sourceSlug !== slug) {
		treeEntries.push({
			path: postPath(sourceSlug),
			mode: "100644",
			type: "blob",
			sha: null,
		});
	}

	const tree = await githubRequest<GitObject>(
		`/repos/${owner}/${repo}/git/trees`,
		token,
		{
			method: "POST",
			body: JSON.stringify({
				base_tree: baseCommit.tree.sha,
				tree: treeEntries,
			}),
		},
	);
	const isNewPost = !sourceSlug;
	const commitMessage = isNewPost
		? `posts:发布新文章《${title}》。由 Fuwari Studio 创建发布 PR。`
		: `posts: 更新文章《${title}》`;
	const commit = await githubRequest<GitCommit>(
		`/repos/${owner}/${repo}/git/commits`,
		token,
		{
			method: "POST",
			body: JSON.stringify({
				message: commitMessage,
				tree: tree.sha,
				parents: [baseCommit.sha],
			}),
		},
	);

	const branch = `studio/${slug}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
	const action = isNewPost ? "发布" : "更新";
	const pullRequest = await createDraftPullRequest(
		env,
		token,
		baseBranch,
		branch,
		commit.sha,
		`${action}文章《${title}》`,
		[
			"## Fuwari Studio 发布请求",
			"",
			`- 操作者：@${actor.sub}`,
			`- 文章：\`${postPath(slug)}\``,
			`- 类型：${isNewPost ? "新文章" : sourceSlug === slug ? "更新文章" : `重命名（${sourceSlug} → ${slug}）`}`,
			"",
			"> 此 PR 不会自动合并。请确认预览和 Actions 检查后再人工合并。",
		].join("\n"),
	);

	return {
		pullRequestUrl: pullRequest.html_url,
		branch,
		commit: commit.sha,
		pullRequestNumber: pullRequest.number,
	};
}

export async function deletePost(
	env: Env,
	actor: SessionClaims,
	slug: string,
): Promise<PublishResult> {
	const token = await getInstallationToken(env);
	const owner = encodeURIComponent(env.GITHUB_OWNER);
	const repo = encodeURIComponent(env.GITHUB_REPO);
	const baseBranch = env.GITHUB_BASE_BRANCH || "main";
	const content = await readPostContent(env, token, slug, baseBranch);
	const title = extractPostTitle(content);

	const baseReference = await githubRequest<GitReference>(
		`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
		token,
	);
	const baseCommit = await githubRequest<GitCommit>(
		`/repos/${owner}/${repo}/git/commits/${baseReference.object.sha}`,
		token,
	);
	const tree = await githubRequest<GitObject>(
		`/repos/${owner}/${repo}/git/trees`,
		token,
		{
			method: "POST",
			body: JSON.stringify({
				base_tree: baseCommit.tree.sha,
				tree: [
					{
						path: postPath(slug),
						mode: "100644",
						type: "blob",
						sha: null,
					},
				],
			}),
		},
	);
	const commit = await githubRequest<GitCommit>(
		`/repos/${owner}/${repo}/git/commits`,
		token,
		{
			method: "POST",
			body: JSON.stringify({
				message: `posts: 删除文章《${title}》`,
				tree: tree.sha,
				parents: [baseCommit.sha],
			}),
		},
	);
	const branch = `studio/delete-${slug}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
	const pullRequest = await createDraftPullRequest(
		env,
		token,
		baseBranch,
		branch,
		commit.sha,
		`删除文章《${title}》`,
		[
			"## Fuwari Studio 删除请求",
			"",
			`- 操作者：@${actor.sub}`,
			`- 文章：\`${postPath(slug)}\``,
			"- 类型：删除文章",
			"",
			"> 此 PR 不会自动合并。请确认删除差异和 Actions 检查后再人工合并。",
		].join("\n"),
	);

	return {
		pullRequestUrl: pullRequest.html_url,
		branch,
		commit: commit.sha,
		pullRequestNumber: pullRequest.number,
	};
}

import { GitHubApiError, publishPost } from "./github";
import {
	constantTimeEqual,
	createRandomToken,
	createSessionToken,
	getCookie,
	getSessionFromRequest,
	isAllowedAdmin,
} from "./security";
import type { Env, GitHubUser, PublishRequest } from "./types";

const MAX_REQUEST_BYTES = 1_000_000;
const OAUTH_STATE_COOKIE = "fuwari_oauth_state";
const GITHUB_API_VERSION = "2026-03-10";

class ApiError extends Error {
	constructor(
		message: string,
		public readonly status = 400,
	) {
		super(message);
		this.name = "ApiError";
	}
}

function securityHeaders(): Headers {
	return new Headers({
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
	});
}

function isTrustedOrigin(request: Request, env: Env): boolean {
	const origin = request.headers.get("Origin");
	if (origin) return origin === env.FRONTEND_ORIGIN;
	return new URL(request.url).origin === env.FRONTEND_ORIGIN;
}

function withCors(headers: Headers, request: Request, env: Env): Headers {
	const origin = request.headers.get("Origin");
	if (origin === env.FRONTEND_ORIGIN) {
		headers.set("Access-Control-Allow-Origin", origin);
		headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
		headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		headers.set("Vary", "Origin");
	}
	return headers;
}

function jsonResponse(
	body: unknown,
	status: number,
	request: Request,
	env: Env,
): Response {
	const headers = withCors(securityHeaders(), request, env);
	headers.set("Content-Type", "application/json; charset=utf-8");
	return new Response(JSON.stringify(body), { status, headers });
}

function redirectResponse(location: string, cookie?: string): Response {
	const headers = securityHeaders();
	headers.set("Location", location);
	if (cookie) headers.append("Set-Cookie", cookie);
	return new Response(null, { status: 302, headers });
}

function frontendAdminUrl(env: Env, fragment: string): string {
	const url = new URL("/admin/", env.FRONTEND_ORIGIN);
	url.hash = fragment;
	return url.toString();
}

function oauthCallbackUrl(request: Request): string {
	return new URL("/api/auth/callback", new URL(request.url).origin).toString();
}

function validateEnvironment(env: Env): void {
	const required: Array<keyof Env> = [
		"FRONTEND_ORIGIN",
		"GITHUB_OWNER",
		"GITHUB_REPO",
		"GITHUB_APP_ID",
		"GITHUB_APP_INSTALLATION_ID",
		"GITHUB_APP_PRIVATE_KEY",
		"GITHUB_APP_CLIENT_ID",
		"GITHUB_APP_CLIENT_SECRET",
		"ADMIN_GITHUB_LOGINS",
		"SESSION_SECRET",
	];
	for (const key of required) {
		if (!env[key]?.trim())
			throw new ApiError(`Worker 缺少环境变量：${key}`, 503);
	}
	if (env.SESSION_SECRET.length < 32) {
		throw new ApiError("SESSION_SECRET 至少需要 32 个字符", 503);
	}
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
	validateEnvironment(env);
	const state = createRandomToken();
	const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
	authorizeUrl.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
	authorizeUrl.searchParams.set("redirect_uri", oauthCallbackUrl(request));
	authorizeUrl.searchParams.set("state", state);
	const cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
	return redirectResponse(authorizeUrl.toString(), cookie);
}

async function exchangeOAuthCode(
	request: Request,
	env: Env,
	code: string,
): Promise<string> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "fuwari-studio-worker",
		},
		body: new URLSearchParams({
			client_id: env.GITHUB_APP_CLIENT_ID,
			client_secret: env.GITHUB_APP_CLIENT_SECRET,
			code,
			redirect_uri: oauthCallbackUrl(request),
		}),
		signal: AbortSignal.timeout(12_000),
	});
	const result = (await response.json()) as {
		access_token?: string;
		error_description?: string;
	};
	if (!response.ok || !result.access_token) {
		throw new ApiError(
			result.error_description || "GitHub OAuth 登录失败",
			502,
		);
	}
	return result.access_token;
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"User-Agent": "fuwari-studio-worker",
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
		},
		signal: AbortSignal.timeout(12_000),
	});
	if (!response.ok) throw new ApiError("无法读取 GitHub 用户身份", 502);
	return (await response.json()) as GitHubUser;
}

async function revokeGitHubUserToken(
	accessToken: string,
	env: Env,
): Promise<void> {
	try {
		await fetch(
			`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_APP_CLIENT_ID)}/token`,
			{
				method: "DELETE",
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Basic ${btoa(`${env.GITHUB_APP_CLIENT_ID}:${env.GITHUB_APP_CLIENT_SECRET}`)}`,
					"Content-Type": "application/json",
					"User-Agent": "fuwari-studio-worker",
					"X-GitHub-Api-Version": GITHUB_API_VERSION,
				},
				body: JSON.stringify({ access_token: accessToken }),
				signal: AbortSignal.timeout(12_000),
			},
		);
	} catch {
		// The short-lived Studio session is independent from the OAuth token.
		// A failed best-effort revocation must not lock the administrator out.
	}
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
	validateEnvironment(env);
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const storedState = getCookie(request, OAUTH_STATE_COOKIE);
	const clearCookie = `${OAUTH_STATE_COOKIE}=; Path=/api/auth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
	if (
		!code ||
		!state ||
		!storedState ||
		!constantTimeEqual(state, storedState)
	) {
		return redirectResponse(
			frontendAdminUrl(
				env,
				"auth_error=OAuth%20state%20%E6%A0%A1%E9%AA%8C%E5%A4%B1%E8%B4%A5",
			),
			clearCookie,
		);
	}

	let accessToken = "";
	try {
		accessToken = await exchangeOAuthCode(request, env, code);
		const user = await getGitHubUser(accessToken);
		if (!isAllowedAdmin(env, user.login)) {
			return redirectResponse(
				frontendAdminUrl(
					env,
					"auth_error=%E5%BD%93%E5%89%8D%20GitHub%20%E7%94%A8%E6%88%B7%E6%97%A0%E7%AE%A1%E7%90%86%E6%9D%83%E9%99%90",
				),
				clearCookie,
			);
		}
		const session = await createSessionToken(user, env);
		return redirectResponse(
			frontendAdminUrl(env, `studio_session=${encodeURIComponent(session)}`),
			clearCookie,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "GitHub 登录失败";
		return redirectResponse(
			frontendAdminUrl(env, `auth_error=${encodeURIComponent(message)}`),
			clearCookie,
		);
	} finally {
		if (accessToken) await revokeGitHubUserToken(accessToken, env);
	}
}

async function requireSession(request: Request, env: Env) {
	if (!isTrustedOrigin(request, env))
		throw new ApiError("请求来源不受信任", 403);
	const session = await getSessionFromRequest(request, env);
	if (!session) throw new ApiError("管理会话无效或已过期", 401);
	return session;
}

async function readPublishRequest(request: Request): Promise<PublishRequest> {
	const contentLength = Number(request.headers.get("Content-Length") ?? "0");
	if (contentLength > MAX_REQUEST_BYTES)
		throw new ApiError("文章内容超过 1 MB", 413);
	const rawBody = await request.text();
	if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
		throw new ApiError("文章内容超过 1 MB", 413);
	}
	let payload: PublishRequest;
	try {
		payload = JSON.parse(rawBody) as PublishRequest;
	} catch {
		throw new ApiError("请求体必须是有效 JSON");
	}
	if (typeof payload.content !== "string" || !payload.content.trim()) {
		throw new ApiError("文章内容不能为空");
	}
	if (
		payload.sourceSlug !== undefined &&
		typeof payload.sourceSlug !== "string"
	) {
		throw new ApiError("源文章路径格式无效");
	}
	return payload;
}

function validateSlug(slug: string, label: string): void {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		throw new ApiError(`${label}只能使用小写字母、数字和连字符`);
	}
}

async function route(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	if (request.method === "OPTIONS") {
		if (request.headers.get("Origin") !== env.FRONTEND_ORIGIN) {
			return jsonResponse({ error: "请求来源不受信任" }, 403, request, env);
		}
		return new Response(null, {
			status: 204,
			headers: withCors(securityHeaders(), request, env),
		});
	}

	if (request.method === "GET" && url.pathname === "/api/health") {
		return jsonResponse(
			{ ok: true, service: "fuwari-studio" },
			200,
			request,
			env,
		);
	}
	if (request.method === "GET" && url.pathname === "/api/auth/login") {
		return handleLogin(request, env);
	}
	if (request.method === "GET" && url.pathname === "/api/auth/callback") {
		return handleCallback(request, env);
	}
	if (request.method === "GET" && url.pathname === "/api/auth/status") {
		const session = await requireSession(request, env);
		return jsonResponse(
			{
				authenticated: true,
				user: {
					login: session.sub,
					name: session.name,
					avatarUrl: session.avatarUrl,
				},
				expiresAt: new Date(session.exp * 1000).toISOString(),
			},
			200,
			request,
			env,
		);
	}

	const publishMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/publish$/);
	if (request.method === "POST" && publishMatch) {
		validateEnvironment(env);
		const session = await requireSession(request, env);
		const slug = decodeURIComponent(publishMatch[1]);
		validateSlug(slug, "文章路径");
		const payload = await readPublishRequest(request);
		if (payload.sourceSlug) validateSlug(payload.sourceSlug, "源文章路径");
		const result = await publishPost(
			env,
			session,
			slug,
			payload.content,
			payload.sourceSlug,
		);
		return jsonResponse(result, 201, request, env);
	}

	throw new ApiError("接口不存在", 404);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const requestId = crypto.randomUUID();
		try {
			const response = await route(request, env);
			response.headers.set("X-Request-Id", requestId);
			return response;
		} catch (error) {
			const status =
				error instanceof ApiError
					? error.status
					: error instanceof GitHubApiError &&
							(error.status === 400 || error.status === 409)
						? error.status
						: 502;
			const message =
				error instanceof ApiError || error instanceof GitHubApiError
					? error.message
					: "发布服务暂时不可用";
			const response = jsonResponse(
				{ error: message, requestId },
				status,
				request,
				env,
			);
			response.headers.set("X-Request-Id", requestId);
			return response;
		}
	},
};

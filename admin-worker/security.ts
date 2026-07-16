import type { Env, GitHubUser, SessionClaims } from "./types";

const SESSION_TTL_SECONDS = 2 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export function encodeBase64Url(value: string | Uint8Array): string {
	const bytes = typeof value === "string" ? encoder.encode(value) : value;
	return bytesToBase64(bytes)
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
	return base64ToBytes(`${normalized}${padding}`);
}

function decodeJsonSegment<T>(value: string): T | null {
	try {
		return JSON.parse(decoder.decode(decodeBase64Url(value))) as T;
	} catch {
		return null;
	}
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export function getAllowedAdminLogins(env: Env): Set<string> {
	return new Set(
		env.ADMIN_GITHUB_LOGINS.split(",")
			.map((login) => login.trim().toLowerCase())
			.filter(Boolean),
	);
}

export function isAllowedAdmin(env: Env, login: string): boolean {
	return getAllowedAdminLogins(env).has(login.trim().toLowerCase());
}

export function createRandomToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return encodeBase64Url(bytes);
}

export function getCookie(request: Request, name: string): string | null {
	const cookieHeader = request.headers.get("Cookie") ?? "";
	for (const part of cookieHeader.split(";")) {
		const [cookieName, ...valueParts] = part.trim().split("=");
		if (cookieName === name) return decodeURIComponent(valueParts.join("="));
	}
	return null;
}

export function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	let difference = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}

export async function createSessionToken(
	user: GitHubUser,
	env: Env,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const claims: SessionClaims = {
		sub: user.login.toLowerCase(),
		name: user.name?.trim() || user.login,
		avatarUrl: user.avatar_url,
		iat: now,
		exp: now + SESSION_TTL_SECONDS,
		iss: "fuwari-studio",
		aud: env.FRONTEND_ORIGIN,
	};
	const payload = encodeBase64Url(JSON.stringify(claims));
	const signingInput = `${header}.${payload}`;
	const key = await importSessionKey(env.SESSION_SECRET);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(signingInput),
	);
	return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
	token: string,
	env: Env,
): Promise<SessionClaims | null> {
	if (token.length > 4096) return null;
	const [encodedHeader, encodedPayload, encodedSignature, ...rest] =
		token.split(".");
	if (
		!encodedHeader ||
		!encodedPayload ||
		!encodedSignature ||
		rest.length > 0
	) {
		return null;
	}

	const header = decodeJsonSegment<{ alg?: string; typ?: string }>(
		encodedHeader,
	);
	if (header?.alg !== "HS256" || header.typ !== "JWT") return null;

	const key = await importSessionKey(env.SESSION_SECRET);
	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		decodeBase64Url(encodedSignature),
		encoder.encode(`${encodedHeader}.${encodedPayload}`),
	);
	if (!isValid) return null;

	const claims = decodeJsonSegment<SessionClaims>(encodedPayload);
	const now = Math.floor(Date.now() / 1000);
	if (
		!claims ||
		claims.iss !== "fuwari-studio" ||
		claims.aud !== env.FRONTEND_ORIGIN ||
		claims.exp <= now ||
		claims.iat > now + 60 ||
		!isAllowedAdmin(env, claims.sub)
	) {
		return null;
	}
	return claims;
}

export async function getSessionFromRequest(
	request: Request,
	env: Env,
): Promise<SessionClaims | null> {
	const authorization = request.headers.get("Authorization") ?? "";
	if (!authorization.startsWith("Bearer ")) return null;
	return verifySessionToken(authorization.slice("Bearer ".length).trim(), env);
}

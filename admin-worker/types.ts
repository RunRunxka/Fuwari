export interface Env {
	FRONTEND_ORIGIN: string;
	GITHUB_OWNER: string;
	GITHUB_REPO: string;
	GITHUB_BASE_BRANCH: string;
	GITHUB_APP_ID: string;
	GITHUB_APP_INSTALLATION_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	GITHUB_APP_CLIENT_ID: string;
	GITHUB_APP_CLIENT_SECRET: string;
	ADMIN_GITHUB_LOGINS: string;
	SESSION_SECRET: string;
}

export interface GitHubUser {
	login: string;
	name: string | null;
	avatar_url: string;
}

export interface SessionClaims {
	sub: string;
	name: string;
	avatarUrl: string;
	iat: number;
	exp: number;
	iss: "fuwari-studio";
	aud: string;
}

export interface PublishRequest {
	content: string;
	sourceSlug?: string;
}

export interface PublishResult {
	pullRequestUrl: string;
	branch: string;
	commit: string;
	pullRequestNumber: number;
}

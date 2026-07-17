export type Env = WorkerBindings;

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

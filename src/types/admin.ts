export type AdminPostStatus = "draft" | "published";
export type AdminAssetRole = "cover" | "content";

export interface AdminAsset {
	key: string;
	url: string;
	size: number;
	uploaded: string;
	role: AdminAssetRole;
	postSlug: string;
	alt: string;
	originalName: string;
	contentType: string;
	etag: string;
}

export interface AdminAssetList {
	assets: AdminAsset[];
	cursor: string | null;
}

export interface AdminPost {
	id: string;
	slug: string;
	sourceSlug?: string;
	title: string;
	published: string;
	updated?: string;
	draft: boolean;
	description: string;
	image: string;
	tags: string[];
	lang: string;
	pinned: boolean;
	aiLevel?: 1 | 2 | 3;
	body: string;
}

export interface AdminPublishResult {
	pullRequestUrl: string;
	branch: string;
	commit: string;
	pullRequestNumber?: number;
}

export interface AdminSessionUser {
	login: string;
	name: string;
	avatarUrl: string;
}

export interface AdminAuthStatus {
	authenticated: true;
	user: AdminSessionUser;
	expiresAt: string;
}

export function getAdminPostStatus(post: AdminPost): AdminPostStatus {
	return post.draft ? "draft" : "published";
}

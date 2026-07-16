export type AdminPostStatus = "draft" | "published";

export interface AdminPost {
	id: string;
	slug: string;
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
}

export function getAdminPostStatus(post: AdminPost): AdminPostStatus {
	return post.draft ? "draft" : "published";
}

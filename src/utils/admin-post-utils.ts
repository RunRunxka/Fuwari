import type { AdminPost } from "@/types/admin";

function quoteYamlString(value: string): string {
	return JSON.stringify(value);
}

function serializeTags(tags: string[]): string {
	return `[${tags.map(quoteYamlString).join(", ")}]`;
}

export function cloneAdminPost(post: AdminPost): AdminPost {
	return {
		...post,
		tags: [...post.tags],
	};
}

export function serializeAdminPost(post: AdminPost): string {
	const frontmatter = [
		"---",
		`title: ${quoteYamlString(post.title.trim())}`,
		`published: ${post.published}`,
	];

	if (post.updated) {
		frontmatter.push(`updated: ${post.updated}`);
	}
	if (post.description.trim()) {
		frontmatter.push(
			`description: ${quoteYamlString(post.description.trim())}`,
		);
	}
	if (post.image.trim()) {
		frontmatter.push(`image: ${quoteYamlString(post.image.trim())}`);
	}
	if (post.tags.length > 0) {
		frontmatter.push(`tags: ${serializeTags(post.tags)}`);
	}
	if (post.lang.trim()) {
		frontmatter.push(`lang: ${quoteYamlString(post.lang.trim())}`);
	}

	frontmatter.push(`draft: ${post.draft}`);
	frontmatter.push(`pinned: ${post.pinned}`);
	if (post.aiLevel) {
		frontmatter.push(`ai_level: ${post.aiLevel}`);
	}
	frontmatter.push("---", "", post.body.trimEnd(), "");

	return frontmatter.join("\n");
}

export function validateAdminPost(post: AdminPost): string[] {
	const errors: string[] = [];
	if (!post.title.trim()) errors.push("文章标题不能为空");
	if (!post.slug.trim()) errors.push("文章路径不能为空");
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
		errors.push("文章路径只能使用小写字母、数字和连字符");
	}
	if (!post.published || Number.isNaN(new Date(post.published).getTime())) {
		errors.push("发布日期格式无效");
	}
	if (!post.body.trim()) errors.push("文章正文不能为空");
	if (post.aiLevel && ![1, 2, 3].includes(post.aiLevel)) {
		errors.push("AI 参与等级只能是 1、2 或 3");
	}
	return errors;
}

<script lang="ts">
import type { AdminPost } from "@/types/admin";
import Icon from "@iconify/svelte";

export let post: AdminPost;
export let html = "";

function formatPreviewDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "日期待修正";
	return new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function getPreviewImageSrc(value: string): string {
	const image = value.trim();
	if (image.startsWith("/") || /^https?:\/\//.test(image)) return image;
	return "";
}

$: previewImage = getPreviewImageSrc(post.image);
</script>

<article class="preview-card">
	{#if previewImage}
		<div class="preview-cover">
			<img src={previewImage} alt="" />
		</div>
	{/if}

	<header class="preview-header">
		<div class="preview-kicker">
			<span class="preview-accent"></span>
			<span>{post.draft ? "草稿预览" : "文章预览"}</span>
		</div>
		<h1>{post.title || "未命名文章"}</h1>
		{#if post.description}
			<p class="preview-description">{post.description}</p>
		{/if}

		<div class="preview-meta">
			<span>
				<Icon icon="material-symbols:schedule-outline-rounded" />
				{formatPreviewDate(post.published)}
			</span>
			<span>
				<Icon icon="material-symbols:folder-outline-rounded" />
				/posts/{post.slug}/
			</span>
		</div>

		{#if post.tags.length > 0}
			<div class="preview-tags">
				{#each post.tags as tag}
					<span>{tag}</span>
				{/each}
			</div>
		{/if}
	</header>

	<div class="preview-divider"></div>
	<div class="preview-markdown custom-md markdown-content">
		{@html html}
	</div>
</article>

<style>
	.preview-card {
		min-height: 31rem;
		padding: 1.4rem;
		color: var(--btn-content);
	}

	.preview-cover {
		margin: -1.4rem -1.4rem 1.25rem;
		aspect-ratio: 16 / 7;
		overflow: hidden;
		border-radius: var(--radius-large) var(--radius-large) 0 0;
		background: var(--btn-regular-bg);
	}

	.preview-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.preview-header h1 {
		margin: 0.55rem 0 0;
		font-size: clamp(1.35rem, 2vw, 1.85rem);
		line-height: 1.28;
		font-weight: 700;
		color: var(--text-90, currentColor);
	}

	.preview-kicker {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.preview-accent {
		width: 0.22rem;
		height: 1rem;
		border-radius: 999px;
		background: var(--primary);
	}

	.preview-description {
		margin: 0.75rem 0 0;
		font-size: 0.88rem;
		line-height: 1.7;
		color: color-mix(in oklab, currentColor 62%, transparent);
	}

	.preview-meta,
	.preview-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.9rem;
	}

	.preview-meta span,
	.preview-tags span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 1.8rem;
		padding: 0 0.62rem;
		border-radius: 0.55rem;
		background: var(--btn-regular-bg);
		font-size: 0.72rem;
		color: color-mix(in oklab, currentColor 65%, transparent);
	}

	.preview-meta :global(svg) {
		font-size: 0.95rem;
		color: var(--primary);
	}

	.preview-tags span {
		color: var(--btn-content);
	}

	.preview-divider {
		height: 1px;
		margin: 1.2rem 0;
		background: var(--line-divider);
	}

	.preview-markdown {
		font-size: 0.9rem;
		line-height: 1.8;
		color: color-mix(in oklab, currentColor 76%, transparent);
	}

	.preview-markdown :global(h1),
	.preview-markdown :global(h2),
	.preview-markdown :global(h3) {
		color: var(--btn-content);
	}

	.preview-markdown :global(img) {
		max-width: 100%;
		border-radius: 0.75rem;
	}

	.preview-markdown :global(pre) {
		overflow-x: auto;
		padding: 0.9rem;
		border-radius: 0.75rem;
		background: var(--codeblock-bg);
	}
</style>

<script lang="ts">
import type {
	AdminAuthStatus,
	AdminPost,
	AdminPublishResult,
	AdminSessionUser,
} from "@/types/admin";
import {
	DARK_MODE,
	LIGHT_MODE,
	SYSTEM_MODE,
	type ThemeMode,
} from "@constants/constants";
import Icon from "@iconify/svelte";
import {
	cloneAdminPost,
	serializeAdminPost,
	validateAdminPost,
} from "@utils/admin-post-utils";
import { getThemeMode, setTheme, setThemeMode } from "@utils/setting-utils";
import { gsap } from "gsap";
import MarkdownIt from "markdown-it";
import { onMount, tick } from "svelte";
import AdminPostPreview from "./AdminPostPreview.svelte";

type PostFilter = "all" | "draft" | "published";
type MobileView = "articles" | "editor" | "preview";
type SaveState = "idle" | "saving" | "saved";
type AuthState =
	| "disabled"
	| "checking"
	| "anonymous"
	| "authenticated"
	| "unavailable";

interface StoredDraft {
	post: AdminPost;
	savedAt: string;
}

export let posts: AdminPost[] = [];
export let apiBase = "";

const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: true,
});

const themeModeIcons: Record<ThemeMode, string> = {
	[SYSTEM_MODE]: "material-symbols:settings-brightness-rounded",
	[DARK_MODE]: "material-symbols:dark-mode-outline-rounded",
	[LIGHT_MODE]: "material-symbols:light-mode-outline-rounded",
};

const SESSION_STORAGE_KEY = "fuwari-studio:session";

let rootElement: HTMLElement;
let editorPanel: HTMLElement;
let previewPanel: HTMLElement;
let noticeElement: HTMLElement;
let workspacePosts = posts.map(cloneAdminPost);
let selectedId = workspacePosts[0]?.id ?? "";
let currentPost = workspacePosts[0]
	? cloneAdminPost(workspacePosts[0])
	: createEmptyPost();
let query = "";
let filter: PostFilter = "all";
let mobileView: MobileView = "editor";
let tagsInput = currentPost.tags.join(", ");
let isDirty = false;
let saveState: SaveState = "idle";
let savedAt = "";
let notice = "";
let publishResult: AdminPublishResult | null = null;
let isPublishing = false;
let authState: AuthState = apiBase ? "checking" : "disabled";
let authUser: AdminSessionUser | null = null;
let sessionToken = "";
let sessionExpiresAt = "";
let themeMode: ThemeMode = SYSTEM_MODE;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let selectionTween: ReturnType<typeof gsap.fromTo> | undefined;
let noticeTween: ReturnType<typeof gsap.fromTo> | undefined;

$: normalizedQuery = query.trim().toLowerCase();
$: normalizedApiBase = apiBase.replace(/\/+$/, "");
$: filteredPosts = workspacePosts.filter((post) => {
	const matchesFilter =
		filter === "all" ||
		(filter === "draft" && post.draft) ||
		(filter === "published" && !post.draft);
	if (!matchesFilter) return false;
	if (!normalizedQuery) return true;
	return [post.title, post.slug, post.description, post.tags.join(" ")]
		.join(" ")
		.toLowerCase()
		.includes(normalizedQuery);
});
$: previewHtml = markdown.render(currentPost.body || "_正文将在这里预览。_");
$: validationErrors = validateAdminPost(currentPost);
$: publishSteps = [
	{
		label: "本地草稿已保存",
		detail: savedAt || "等待保存",
		done: saveState === "saved" && !isDirty,
	},
	{
		label: "内容 Schema 校验",
		detail:
			validationErrors.length === 0
				? "全部字段有效"
				: `${validationErrors.length} 项待处理`,
		done: validationErrors.length === 0,
	},
	{
		label: "GitHub 预览分支",
		detail: publishResult
			? isDirty
				? "PR 已创建；当前改动尚未包含"
				: publishResult.branch
			: "尚未创建",
		done: Boolean(publishResult),
	},
	{
		label: "合并并部署",
		detail: publishResult ? "等待 PR 合并" : "等待发布",
		done: false,
	},
];
$: publishProgress =
	publishSteps.filter((step) => step.done).length / publishSteps.length;
$: themeIcon = themeModeIcons[themeMode] ?? themeModeIcons[SYSTEM_MODE];
$: publishActionLabel = publishResult
	? "PR 已创建"
	: isPublishing
		? "正在发布"
		: authState === "authenticated"
			? "准备发布"
			: authState === "checking"
				? "验证身份"
				: apiBase
					? "登录后发布"
					: "准备发布";
$: publishActionIcon = isPublishing
	? "material-symbols:progress-activity"
	: publishResult
		? "material-symbols:check-circle-outline-rounded"
		: authState === "authenticated"
			? "material-symbols:publish-rounded"
			: "fa6-brands:github";
$: publishActionDisabled =
	isPublishing || authState === "checking" || Boolean(publishResult);
$: sessionExpiryLabel = sessionExpiresAt
	? new Intl.DateTimeFormat("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(sessionExpiresAt))
	: "";

function createEmptyPost(): AdminPost {
	const now = new Date();
	const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
	return {
		id: `new-${Date.now()}`,
		slug: "new-post",
		title: "未命名文章",
		published: localDate,
		draft: true,
		description: "",
		image: "",
		tags: [],
		lang: "zh-cn",
		pinned: false,
		body: "# 开始写作\n\n在这里记录新的想法。",
	};
}

function getStorageKey(id: string): string {
	return `fuwari-studio:draft:${id}`;
}

function readStoredDraft(post: AdminPost): StoredDraft | null {
	try {
		const raw = localStorage.getItem(getStorageKey(post.id));
		if (!raw) return null;
		const stored = JSON.parse(raw) as StoredDraft;
		if (!stored?.post || stored.post.id !== post.id) return null;
		return stored;
	} catch {
		return null;
	}
}

function syncPostToWorkspace(): void {
	const index = workspacePosts.findIndex((post) => post.id === currentPost.id);
	if (index === -1) {
		workspacePosts = [cloneAdminPost(currentPost), ...workspacePosts];
		return;
	}
	workspacePosts[index] = cloneAdminPost(currentPost);
	workspacePosts = [...workspacePosts];
}

function saveLocalDraft(): void {
	if (typeof localStorage === "undefined") return;
	if (saveTimer) clearTimeout(saveTimer);
	saveState = "saving";
	syncPostToWorkspace();
	const timestamp = new Date().toISOString();
	localStorage.setItem(
		getStorageKey(currentPost.id),
		JSON.stringify({ post: currentPost, savedAt: timestamp }),
	);
	savedAt = new Intl.DateTimeFormat("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(timestamp));
	isDirty = false;
	saveState = "saved";
}

function scheduleLocalSave(): void {
	isDirty = true;
	saveState = "saving";
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(saveLocalDraft, 650);
}

function updateTags(event: Event): void {
	const input = event.currentTarget as HTMLInputElement;
	tagsInput = input.value;
	currentPost.tags = input.value
		.split(/[,，]/)
		.map((tag) => tag.trim())
		.filter(Boolean);
	currentPost = cloneAdminPost(currentPost);
	scheduleLocalSave();
}

async function selectPost(post: AdminPost): Promise<void> {
	if (currentPost.id === post.id) {
		mobileView = "editor";
		return;
	}
	if (saveTimer) saveLocalDraft();
	const stored = readStoredDraft(post);
	const restoredPost = cloneAdminPost(stored?.post ?? post);
	currentPost = {
		...restoredPost,
		sourceSlug: restoredPost.sourceSlug ?? post.sourceSlug,
	};
	selectedId = post.id;
	tagsInput = currentPost.tags.join(", ");
	savedAt = stored?.savedAt
		? new Intl.DateTimeFormat("zh-CN", {
				hour: "2-digit",
				minute: "2-digit",
			}).format(new Date(stored.savedAt))
		: "";
	saveState = stored ? "saved" : "idle";
	isDirty = false;
	publishResult = null;
	mobileView = "editor";
	await tick();
	animatePostChange();
}

async function createPost(): Promise<void> {
	if (saveTimer) saveLocalDraft();
	const post = createEmptyPost();
	workspacePosts = [post, ...workspacePosts];
	currentPost = cloneAdminPost(post);
	selectedId = post.id;
	tagsInput = "";
	savedAt = "";
	saveState = "idle";
	isDirty = true;
	publishResult = null;
	mobileView = "editor";
	await tick();
	animatePostChange();
}

function resetCurrentPost(): void {
	const original = posts.find((post) => post.id === currentPost.id);
	if (!original) {
		showNotice("新文章尚无仓库版本，可继续编辑或删除本地草稿。");
		return;
	}
	localStorage.removeItem(getStorageKey(currentPost.id));
	currentPost = cloneAdminPost(original);
	tagsInput = currentPost.tags.join(", ");
	isDirty = false;
	saveState = "idle";
	savedAt = "";
	publishResult = null;
	syncPostToWorkspace();
	showNotice("已恢复为仓库中的文章版本。");
}

function downloadMarkdown(): void {
	const content = serializeAdminPost(currentPost);
	const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = `${currentPost.slug || "post"}.md`;
	anchor.click();
	URL.revokeObjectURL(objectUrl);
	showNotice("Markdown 已导出，可直接放入文章目录。");
}

function clearAdminSession(): void {
	sessionToken = "";
	authUser = null;
	sessionExpiresAt = "";
	try {
		sessionStorage.removeItem(SESSION_STORAGE_KEY);
	} catch {
		// Storage can be unavailable in private browsing; in-memory logout still works.
	}
}

function saveAdminSession(token: string): void {
	sessionToken = token;
	try {
		sessionStorage.setItem(SESSION_STORAGE_KEY, token);
	} catch {
		// Keep the authenticated session in memory when storage is unavailable.
	}
}

function readAdminSession(): string {
	try {
		return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

function clearAuthFragment(): void {
	if (!window.location.hash) return;
	window.history.replaceState(
		window.history.state,
		"",
		`${window.location.pathname}${window.location.search}`,
	);
}

async function initializeAuth(): Promise<void> {
	if (!normalizedApiBase) {
		authState = "disabled";
		return;
	}

	authState = "checking";
	const fragment = new URLSearchParams(window.location.hash.slice(1));
	const returnedSession = fragment.get("studio_session") ?? "";
	const authError = fragment.get("auth_error") ?? "";
	if (returnedSession || authError) clearAuthFragment();
	if (authError) showNotice(authError);
	if (returnedSession) saveAdminSession(returnedSession);
	else sessionToken = readAdminSession();

	if (!sessionToken) {
		authState = "anonymous";
		return;
	}

	try {
		const response = await fetch(`${normalizedApiBase}/api/auth/status`, {
			headers: { Authorization: `Bearer ${sessionToken}` },
		});
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				clearAdminSession();
				authState = "anonymous";
				return;
			}
			throw new Error(`身份服务响应异常（${response.status}）`);
		}
		const status = (await response.json()) as AdminAuthStatus;
		authUser = status.user;
		sessionExpiresAt = status.expiresAt;
		authState = "authenticated";
	} catch (error) {
		authState = "unavailable";
		showNotice(
			error instanceof Error ? error.message : "暂时无法连接 GitHub 身份服务",
		);
	}
}

function startGitHubLogin(): void {
	if (!normalizedApiBase) {
		showNotice("GitHub 发布服务尚未配置；请先部署 admin-worker。");
		return;
	}
	window.location.assign(`${normalizedApiBase}/api/auth/login`);
}

function signOut(): void {
	clearAdminSession();
	authState = normalizedApiBase ? "anonymous" : "disabled";
	showNotice("已退出 Fuwari Studio 管理会话。");
}

function handlePublishAction(): void {
	if (authState !== "authenticated") {
		if (authState === "unavailable") {
			void initializeAuth();
			return;
		}
		startGitHubLogin();
		return;
	}
	void publishCurrentPost();
}

function handleAuthAction(): void {
	if (authState === "unavailable") {
		void initializeAuth();
		return;
	}
	startGitHubLogin();
}

async function publishCurrentPost(): Promise<void> {
	if (validationErrors.length > 0) {
		showNotice(`发布前需要处理 ${validationErrors.length} 项内容问题。`);
		return;
	}
	if (!normalizedApiBase) {
		showNotice("GitHub 发布服务尚未配置；当前版本可保存草稿和导出 Markdown。");
		return;
	}
	if (!sessionToken || authState !== "authenticated") {
		startGitHubLogin();
		return;
	}

	isPublishing = true;
	try {
		const response = await fetch(
			`${normalizedApiBase}/api/posts/${encodeURIComponent(currentPost.slug)}/publish`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					content: serializeAdminPost(currentPost),
					sourceSlug: currentPost.sourceSlug,
				}),
			},
		);
		const result = (await response.json().catch(() => null)) as
			| (AdminPublishResult & { error?: string })
			| null;
		if (!response.ok) {
			if (response.status === 401) {
				clearAdminSession();
				authState = "anonymous";
			}
			throw new Error(result?.error || `发布请求失败（${response.status}）`);
		}
		if (!result?.pullRequestUrl) throw new Error("发布服务返回结果不完整");
		publishResult = result;
		showNotice("发布 PR 已创建，等待 GitHub 检查完成。");
	} catch (error) {
		showNotice(error instanceof Error ? error.message : "发布请求失败");
	} finally {
		isPublishing = false;
	}
}

function cycleTheme(): void {
	const modes: ThemeMode[] = [SYSTEM_MODE, LIGHT_MODE, DARK_MODE];
	const currentIndex = modes.indexOf(themeMode);
	themeMode = modes[(currentIndex + 1) % modes.length];
	setThemeMode(themeMode);
	setTheme();
}

function setMobileView(view: MobileView): void {
	mobileView = view;
}

function animatePostChange(): void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	selectionTween?.kill();
	const targets = [editorPanel, previewPanel].filter(Boolean);
	selectionTween = gsap.fromTo(
		targets,
		{ autoAlpha: 0, y: 12 },
		{
			autoAlpha: 1,
			y: 0,
			duration: 0.34,
			ease: "power2.out",
			stagger: 0.045,
			clearProps: "transform,opacity,visibility",
		},
	);
}

function showNotice(message: string): void {
	notice = message;
	void tick().then(() => {
		if (!noticeElement) return;
		noticeTween?.kill();
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		noticeTween = gsap.fromTo(
			noticeElement,
			{ autoAlpha: 0, y: 10, scale: 0.98 },
			{
				autoAlpha: 1,
				y: 0,
				scale: 1,
				duration: 0.28,
				ease: "power2.out",
				clearProps: "transform,opacity,visibility",
			},
		);
	});
}

onMount(() => {
	themeMode = getThemeMode();
	void initializeAuth();
	const initial = workspacePosts[0];
	if (initial) {
		const stored = readStoredDraft(initial);
		if (stored) {
			const restoredPost = cloneAdminPost(stored.post);
			currentPost = {
				...restoredPost,
				sourceSlug: restoredPost.sourceSlug ?? initial.sourceSlug,
			};
			tagsInput = currentPost.tags.join(", ");
			saveState = "saved";
			savedAt = new Intl.DateTimeFormat("zh-CN", {
				hour: "2-digit",
				minute: "2-digit",
			}).format(new Date(stored.savedAt));
		}
	}

	const media = gsap.matchMedia();
	media.add(
		{
			desktop: "(min-width: 901px)",
			reduceMotion: "(prefers-reduced-motion: reduce)",
		},
		(context) => {
			if (context.conditions?.reduceMotion) {
				gsap.set([".studio-chrome", ".studio-panel"], { clearProps: "all" });
				return;
			}
			gsap.fromTo(
				".studio-chrome",
				{ autoAlpha: 0, y: -14 },
				{
					autoAlpha: 1,
					y: 0,
					duration: 0.42,
					ease: "power2.out",
					clearProps: "transform,opacity,visibility",
				},
			);
			gsap.fromTo(
				".studio-panel",
				{ autoAlpha: 0, y: context.conditions?.desktop ? 18 : 8 },
				{
					autoAlpha: 1,
					y: 0,
					duration: 0.46,
					ease: "power2.out",
					stagger: 0.065,
					clearProps: "transform,opacity,visibility",
				},
			);
		},
		rootElement,
	);

	return () => {
		if (saveTimer) clearTimeout(saveTimer);
		selectionTween?.kill();
		noticeTween?.kill();
		media.revert();
	};
});
</script>

<div class="admin-studio" bind:this={rootElement}>
	<header class="studio-topbar card-base studio-chrome">
		<div class="studio-brand">
			<div class="brand-mark">
				<Icon icon="material-symbols:edit-square-outline-rounded" />
			</div>
			<div>
				<strong>Fuwari Studio</strong>
				<span>/posts/{currentPost.slug || "new-post"}.md</span>
			</div>
		</div>

		<div class="topbar-state">
			<span class:state-dirty={isDirty}>
				<span class="state-dot"></span>
				{isDirty ? "等待本地保存" : saveState === "saved" ? `已保存 ${savedAt}` : "仓库版本"}
			</span>
		</div>

		<div class="topbar-actions">
			<a class="studio-button button-quiet" href="/" aria-label="返回博客">
				<Icon icon="material-symbols:arrow-outward-rounded" />
				<span>返回博客</span>
			</a>
			<button class="studio-button button-quiet icon-button" type="button" aria-label="切换主题" onclick={cycleTheme}>
				<Icon icon={themeIcon} />
			</button>
			{#if authState === "authenticated" && authUser}
				<div class="topbar-user" title={`已登录 @${authUser.login}`}>
					<img src={authUser.avatarUrl} alt="" />
					<span>@{authUser.login}</span>
					<button type="button" aria-label="退出 GitHub 管理会话" onclick={signOut}>
						<Icon icon="material-symbols:logout-rounded" />
					</button>
				</div>
			{:else if normalizedApiBase}
				<button class="studio-button button-quiet" type="button" disabled={authState === "checking"} onclick={handleAuthAction}>
					<Icon icon={authState === "checking" ? "material-symbols:progress-activity" : "fa6-brands:github"} />
					<span>{authState === "checking" ? "验证身份" : authState === "unavailable" ? "重试身份" : "GitHub 登录"}</span>
				</button>
			{/if}
			<button class="studio-button button-quiet" type="button" onclick={saveLocalDraft}>
				<Icon icon="material-symbols:save-outline-rounded" />
				<span>保存草稿</span>
			</button>
			<button class="studio-button button-primary" type="button" disabled={publishActionDisabled} onclick={handlePublishAction}>
				<Icon icon={publishActionIcon} />
				<span>{publishActionLabel}</span>
			</button>
		</div>
	</header>

	<nav class="mobile-tabs card-base studio-chrome" aria-label="管理端视图">
		<button class:active={mobileView === "articles"} type="button" onclick={() => setMobileView("articles")}>文章</button>
		<button class:active={mobileView === "editor"} type="button" onclick={() => setMobileView("editor")}>编辑</button>
		<button class:active={mobileView === "preview"} type="button" onclick={() => setMobileView("preview")}>预览与发布</button>
	</nav>

	<div class="studio-grid">
		<aside class:mobile-active={mobileView === "articles"} class="article-panel card-base studio-panel">
			<div class="panel-heading">
				<div>
					<span class="eyebrow">内容工作区</span>
					<h2>文章</h2>
				</div>
				<button class="square-action" type="button" aria-label="新建文章" onclick={createPost}>
					<Icon icon="material-symbols:add-rounded" />
				</button>
			</div>

			<div class="workspace-stats">
				<div><strong>{workspacePosts.length}</strong><span>全部</span></div>
				<div><strong>{workspacePosts.filter((post) => post.draft).length}</strong><span>草稿</span></div>
				<div><strong>{workspacePosts.filter((post) => !post.draft).length}</strong><span>已发布</span></div>
			</div>

			<label class="search-field">
				<Icon icon="material-symbols:search-rounded" />
				<input bind:value={query} type="search" placeholder="搜索标题、标签或路径" />
			</label>

			<div class="filter-row" aria-label="文章筛选">
				<button class:active={filter === "all"} type="button" onclick={() => (filter = "all")}>全部</button>
				<button class:active={filter === "draft"} type="button" onclick={() => (filter = "draft")}>草稿</button>
				<button class:active={filter === "published"} type="button" onclick={() => (filter = "published")}>已发布</button>
			</div>

			<div class="post-list show-scrollbar">
				{#each filteredPosts as post (post.id)}
					<button
						class="post-list-item"
						class:active={selectedId === post.id}
						type="button"
						onclick={() => selectPost(post)}
					>
						<span class="post-state" class:draft={post.draft}></span>
						<span class="post-copy">
							<strong>{post.title || "未命名文章"}</strong>
							<small>/posts/{post.slug}/</small>
						</span>
						{#if post.pinned}
							<Icon icon="material-symbols:keep-rounded" />
						{/if}
					</button>
				{:else}
					<div class="empty-state">
						<Icon icon="material-symbols:article-outline-rounded" />
						<strong>没有匹配的文章</strong>
						<span>调整搜索词或筛选条件。</span>
					</div>
				{/each}
			</div>
		</aside>

		<main class:mobile-active={mobileView === "editor"} class="editor-panel card-base studio-panel" bind:this={editorPanel}>
			<div class="editor-heading">
				<div>
					<span class="eyebrow">Markdown 编辑器</span>
					<h2>写作</h2>
				</div>
				<div class="editor-heading-actions">
					<button class="studio-button button-quiet" type="button" onclick={resetCurrentPost}>
						<Icon icon="material-symbols:restore-rounded" />
						恢复仓库版本
					</button>
					<button class="studio-button button-quiet" type="button" onclick={downloadMarkdown}>
						<Icon icon="material-symbols:download-rounded" />
						导出 Markdown
					</button>
				</div>
			</div>

			<div class="editor-fields">
				<label class="title-field">
					<span>文章标题</span>
					<input bind:value={currentPost.title} oninput={scheduleLocalSave} placeholder="输入文章标题" />
				</label>

				<div class="metadata-grid">
					<label>
						<span>文章路径</span>
						<div class="input-with-prefix"><span>/posts/</span><input bind:value={currentPost.slug} oninput={scheduleLocalSave} /></div>
					</label>
					<label>
						<span>发布日期</span>
						<input type="datetime-local" bind:value={currentPost.published} oninput={scheduleLocalSave} />
					</label>
					<label>
						<span>语言</span>
						<input bind:value={currentPost.lang} oninput={scheduleLocalSave} placeholder="zh-cn" />
					</label>
					<label>
						<span>AI 参与等级</span>
						<select bind:value={currentPost.aiLevel} onchange={scheduleLocalSave}>
							<option value={undefined}>未设置</option>
							<option value={1}>1 · 辅助润色</option>
							<option value={2}>2 · 协作撰写</option>
							<option value={3}>3 · 主要生成</option>
						</select>
					</label>
				</div>

				<label>
					<span>文章描述</span>
					<textarea class="description-input" rows="2" bind:value={currentPost.description} oninput={scheduleLocalSave} placeholder="用于文章卡片和 SEO 的简短摘要"></textarea>
				</label>

				<div class="metadata-grid metadata-grid-wide">
					<label>
						<span>标签</span>
						<input value={tagsInput} oninput={updateTags} placeholder="Astro, GitHub Actions, 随笔" />
					</label>
					<label>
						<span>封面路径</span>
						<input bind:value={currentPost.image} oninput={scheduleLocalSave} placeholder="./cover.jpg 或 https://..." />
					</label>
				</div>

				<div class="toggle-row">
					<label class="toggle-control">
						<input type="checkbox" bind:checked={currentPost.draft} onchange={scheduleLocalSave} />
						<span class="toggle-track"><span></span></span>
						<span><strong>草稿</strong><small>生产环境不会显示</small></span>
					</label>
					<label class="toggle-control">
						<input type="checkbox" bind:checked={currentPost.pinned} onchange={scheduleLocalSave} />
						<span class="toggle-track"><span></span></span>
						<span><strong>置顶</strong><small>在首页优先展示</small></span>
					</label>
				</div>

				<label class="body-field">
					<span class="body-label"><span>正文</span><small>{currentPost.body.length} 字符</small></span>
					<textarea bind:value={currentPost.body} oninput={scheduleLocalSave} spellcheck="false" placeholder="# 开始写作"></textarea>
				</label>
			</div>
		</main>

		<aside class:mobile-active={mobileView === "preview"} class="preview-panel studio-panel" bind:this={previewPanel}>
			<section class="card-base preview-surface">
				<div class="preview-toolbar">
					<div>
						<span class="eyebrow">前台同步预览</span>
						<strong>文章页面</strong>
					</div>
					<span class="viewport-chip"><Icon icon="material-symbols:desktop-windows-outline-rounded" />桌面</span>
				</div>
				<AdminPostPreview post={currentPost} html={previewHtml} />
			</section>

			<section class="card-base publish-card">
				<div class="publish-header">
					<div>
						<span class="eyebrow">发布轨道</span>
						<h2>从草稿到上线</h2>
					</div>
					<span>{Math.round(publishProgress * 100)}%</span>
				</div>
				<div class:connected={authState === "authenticated"} class="auth-session">
					{#if authState === "authenticated" && authUser}
						<img src={authUser.avatarUrl} alt="" />
						<span class="auth-copy">
							<strong>{authUser.name}</strong>
							<small>@{authUser.login} · 会话至 {sessionExpiryLabel}</small>
						</span>
						<button type="button" aria-label="退出 GitHub 管理会话" onclick={signOut}>
							<Icon icon="material-symbols:logout-rounded" />
						</button>
					{:else if authState === "disabled"}
						<Icon icon="material-symbols:cloud-off-outline-rounded" />
						<span class="auth-copy">
							<strong>发布服务未配置</strong>
							<small>仍可保存草稿或导出 Markdown。</small>
						</span>
					{:else}
						<Icon icon={authState === "checking" ? "material-symbols:progress-activity" : "fa6-brands:github"} />
						<span class="auth-copy">
							<strong>{authState === "checking" ? "正在验证管理身份" : authState === "unavailable" ? "身份服务暂不可用" : "需要 GitHub 登录"}</strong>
							<small>登录后由 GitHub App 创建草稿 PR。</small>
						</span>
						<button class="auth-action" type="button" disabled={authState === "checking"} onclick={handleAuthAction}>
							{authState === "unavailable" ? "重试" : "登录"}
						</button>
					{/if}
				</div>
				<div class="progress-track"><span style={`transform: scaleX(${publishProgress})`}></span></div>
				<ol class="publish-steps">
					{#each publishSteps as step, index}
						<li class:done={step.done}>
							<span class="step-marker">{step.done ? "✓" : index + 1}</span>
							<span><strong>{step.label}</strong><small>{step.detail}</small></span>
						</li>
					{/each}
				</ol>

				{#if validationErrors.length > 0}
					<div class="validation-box">
						<strong><Icon icon="material-symbols:error-outline-rounded" />发布前检查</strong>
						<ul>
							{#each validationErrors as error}
								<li>{error}</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div class="validation-box valid">
						<strong><Icon icon="material-symbols:verified-outline-rounded" />内容可以发布</strong>
						<span>标题、路径、日期和正文均通过检查。</span>
					</div>
				{/if}

				{#if publishResult}
					<a class="studio-button button-primary publish-link" href={publishResult.pullRequestUrl} target="_blank" rel="noreferrer">
						查看发布 PR
						<Icon icon="material-symbols:arrow-outward-rounded" />
					</a>
				{/if}
			</section>
		</aside>
	</div>

	{#if notice}
		<div class="studio-notice card-base" bind:this={noticeElement} role="status">
			<Icon icon="material-symbols:info-outline-rounded" />
			<span>{notice}</span>
			<button type="button" aria-label="关闭提示" onclick={() => (notice = "")}><Icon icon="material-symbols:close-rounded" /></button>
		</div>
	{/if}
</div>

<style>
	.admin-studio {
		width: min(100% - 2rem, 96rem);
		margin: 0 auto;
		padding: 1rem 0 2rem;
		color: var(--btn-content);
	}

	.studio-topbar {
		position: sticky;
		top: 0.75rem;
		z-index: 40;
		display: grid;
		grid-template-columns: minmax(15rem, 1fr) auto minmax(21rem, 1fr);
		align-items: center;
		gap: 1rem;
		min-height: 4.5rem;
		padding: 0.7rem 0.9rem;
		border-color: color-mix(in oklab, var(--primary) 16%, var(--line-divider));
	}

	.studio-brand,
	.topbar-actions,
	.topbar-state > span,
	.editor-heading,
	.panel-heading,
	.preview-toolbar,
	.publish-header,
	.editor-heading-actions {
		display: flex;
		align-items: center;
	}

	.studio-brand {
		gap: 0.72rem;
		min-width: 0;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 2.7rem;
		height: 2.7rem;
		flex: 0 0 auto;
		border-radius: 0.8rem;
		background: var(--primary);
		color: color-mix(in oklab, var(--deep-text) 82%, black);
		font-size: 1.35rem;
	}

	.studio-brand strong,
	.studio-brand span {
		display: block;
	}

	.studio-brand strong {
		font-size: 1rem;
		font-weight: 700;
	}

	.studio-brand span {
		overflow: hidden;
		margin-top: 0.15rem;
		color: color-mix(in oklab, currentColor 50%, transparent);
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.68rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-state > span {
		justify-content: center;
		gap: 0.45rem;
		font-size: 0.75rem;
		color: color-mix(in oklab, currentColor 58%, transparent);
	}

	.state-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: oklch(0.68 0.13 155);
		box-shadow: 0 0 0 0.22rem oklch(0.68 0.13 155 / 0.14);
	}

	.state-dirty .state-dot {
		background: var(--primary);
		box-shadow: 0 0 0 0.22rem color-mix(in oklab, var(--primary) 14%, transparent);
	}

	.topbar-actions {
		justify-content: flex-end;
		gap: 0.48rem;
	}

	.topbar-user {
		display: flex;
		align-items: center;
		gap: 0.42rem;
		min-height: 2.5rem;
		padding: 0.25rem 0.35rem 0.25rem 0.25rem;
		border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--line-divider));
		border-radius: 0.7rem;
		background: color-mix(in oklab, var(--primary) 7%, var(--btn-regular-bg));
	}

	.topbar-user img,
	.auth-session img {
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 0.55rem;
		object-fit: cover;
	}

	.topbar-user > span {
		max-width: 7rem;
		overflow: hidden;
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.67rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-user button,
	.auth-session button {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 0.5rem;
		background: var(--btn-regular-bg);
		color: color-mix(in oklab, var(--btn-content) 62%, transparent);
	}

	.studio-button,
	.square-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		min-height: 2.5rem;
		padding: 0 0.8rem;
		border: 1px solid transparent;
		border-radius: 0.7rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.button-quiet,
	.square-action {
		background: var(--btn-regular-bg);
		color: var(--btn-content);
	}

	.button-quiet:hover,
	.square-action:hover {
		background: var(--btn-regular-bg-hover);
	}

	.button-primary {
		background: var(--primary);
		color: color-mix(in oklab, var(--deep-text) 86%, black);
	}

	.studio-button:focus-visible,
	.square-action:focus-visible,
	.post-list-item:focus-visible,
	.filter-row button:focus-visible,
	.mobile-tabs button:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	.studio-button:disabled {
		cursor: wait;
		opacity: 0.65;
	}

	.icon-button {
		width: 2.5rem;
		padding: 0;
	}

	.mobile-tabs {
		display: none;
		margin-top: 0.75rem;
		padding: 0.35rem;
	}

	.studio-grid {
		display: grid;
		grid-template-columns: minmax(15.5rem, 17rem) minmax(28rem, 1fr) minmax(20rem, 22rem);
		align-items: start;
		gap: 1rem;
		margin-top: 1rem;
	}

	.studio-panel {
		min-width: 0;
	}

	.article-panel,
	.editor-panel,
	.preview-surface,
	.publish-card {
		border-color: color-mix(in oklab, var(--primary) 12%, var(--line-divider));
	}

	.article-panel {
		position: sticky;
		top: 6.25rem;
		padding: 1rem;
	}

	.panel-heading,
	.editor-heading,
	.preview-toolbar,
	.publish-header {
		justify-content: space-between;
		gap: 1rem;
	}

	.panel-heading h2,
	.editor-heading h2,
	.publish-header h2 {
		margin: 0.18rem 0 0;
		font-size: 1.18rem;
		font-weight: 700;
	}

	.eyebrow {
		display: block;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.square-action {
		width: 2.5rem;
		padding: 0;
		font-size: 1.15rem;
	}

	.workspace-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 1rem 0;
		border-block: 1px solid var(--line-divider);
	}

	.workspace-stats div {
		padding: 0.8rem 0.35rem;
		text-align: center;
	}

	.workspace-stats div + div {
		border-left: 1px solid var(--line-divider);
	}

	.workspace-stats strong,
	.workspace-stats span {
		display: block;
	}

	.workspace-stats strong {
		font-size: 1rem;
	}

	.workspace-stats span {
		margin-top: 0.12rem;
		font-size: 0.66rem;
		color: color-mix(in oklab, currentColor 48%, transparent);
	}

	.search-field {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-field :global(svg) {
		position: absolute;
		left: 0.72rem;
		font-size: 1rem;
		color: color-mix(in oklab, currentColor 45%, transparent);
	}

	.search-field input {
		width: 100%;
		padding-left: 2.2rem;
	}

	.filter-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.3rem;
		margin-top: 0.6rem;
		padding: 0.3rem;
		border-radius: 0.65rem;
		background: color-mix(in oklab, var(--btn-regular-bg) 72%, transparent);
	}

	.filter-row button,
	.mobile-tabs button {
		min-height: 2rem;
		border-radius: 0.48rem;
		font-size: 0.7rem;
		color: color-mix(in oklab, currentColor 55%, transparent);
	}

	.filter-row button.active,
	.mobile-tabs button.active {
		background: var(--btn-regular-bg-hover);
		color: var(--primary);
		font-weight: 700;
	}

	.post-list {
		max-height: calc(100vh - 23rem);
		min-height: 12rem;
		margin: 0.8rem -0.35rem -0.35rem;
		overflow-y: auto;
		padding: 0.15rem 0.35rem 0.35rem;
	}

	.post-list-item {
		display: grid;
		grid-template-columns: 0.45rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0.72rem 0.65rem;
		border: 1px solid transparent;
		border-radius: 0.72rem;
		text-align: left;
		color: inherit;
	}

	.post-list-item:hover {
		background: var(--btn-plain-bg-hover);
	}

	.post-list-item.active {
		border-color: color-mix(in oklab, var(--primary) 28%, transparent);
		background: color-mix(in oklab, var(--primary) 10%, var(--btn-regular-bg));
	}

	.post-state {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: oklch(0.68 0.13 155);
	}

	.post-state.draft {
		background: var(--primary);
	}

	.post-copy,
	.post-copy strong,
	.post-copy small {
		display: block;
		min-width: 0;
	}

	.post-copy strong,
	.post-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.post-copy strong {
		font-size: 0.8rem;
		font-weight: 600;
	}

	.post-copy small {
		margin-top: 0.18rem;
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.62rem;
		color: color-mix(in oklab, currentColor 42%, transparent);
	}

	.post-list-item > :global(svg) {
		color: var(--primary);
	}

	.empty-state {
		display: grid;
		place-items: center;
		min-height: 12rem;
		text-align: center;
		color: color-mix(in oklab, currentColor 45%, transparent);
	}

	.empty-state :global(svg) {
		font-size: 2rem;
	}

	.empty-state strong {
		font-size: 0.82rem;
	}

	.empty-state span {
		font-size: 0.7rem;
	}

	.editor-panel {
		padding: 1.15rem;
	}

	.editor-heading {
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--line-divider);
	}

	.editor-heading-actions {
		gap: 0.45rem;
	}

	.editor-fields {
		display: grid;
		gap: 1rem;
		padding-top: 1rem;
	}

	.editor-fields label > span,
	.body-label {
		display: block;
		margin-bottom: 0.42rem;
		font-size: 0.68rem;
		font-weight: 700;
		color: color-mix(in oklab, currentColor 58%, transparent);
	}

	.title-field input {
		min-height: 3.35rem;
		font-size: 1.35rem;
		font-weight: 700;
	}

	.metadata-grid {
		display: grid;
		grid-template-columns: 1.35fr 1fr 0.65fr 0.9fr;
		gap: 0.7rem;
	}

	.metadata-grid-wide {
		grid-template-columns: 1fr 1fr;
	}

	input,
	textarea,
	select,
	.input-with-prefix {
		width: 100%;
		border: 1px solid color-mix(in oklab, var(--line-divider) 80%, transparent);
		border-radius: 0.68rem;
		background: color-mix(in oklab, var(--btn-regular-bg) 86%, transparent);
		color: var(--btn-content);
		font-size: 0.78rem;
	}

	input,
	select {
		min-height: 2.65rem;
		padding: 0 0.75rem;
	}

	textarea {
		padding: 0.75rem;
		resize: vertical;
	}

	input::placeholder,
	textarea::placeholder {
		color: color-mix(in oklab, currentColor 34%, transparent);
	}

	input:focus,
	textarea:focus,
	select:focus,
	.input-with-prefix:focus-within {
		border-color: color-mix(in oklab, var(--primary) 70%, transparent);
		outline: 2px solid color-mix(in oklab, var(--primary) 18%, transparent);
		outline-offset: 1px;
	}

	.input-with-prefix {
		display: flex;
		align-items: center;
		overflow: hidden;
	}

	.input-with-prefix > span {
		padding-left: 0.75rem;
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.68rem;
		color: color-mix(in oklab, currentColor 38%, transparent);
	}

	.input-with-prefix input {
		min-width: 0;
		border: 0;
		background: transparent;
		font-family: "JetBrains Mono Variable", monospace;
		outline: 0;
	}

	.description-input {
		min-height: 4.6rem;
		line-height: 1.6;
	}

	.toggle-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}

	.toggle-control {
		display: flex;
		align-items: center;
		gap: 0.72rem;
		padding: 0.72rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.72rem;
		background: color-mix(in oklab, var(--btn-regular-bg) 64%, transparent);
		cursor: pointer;
	}

	.toggle-control input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.toggle-track {
		position: relative;
		width: 2.1rem;
		height: 1.2rem;
		flex: 0 0 auto;
		border-radius: 999px;
		background: var(--btn-regular-bg-active);
	}

	.toggle-track span {
		position: absolute;
		top: 0.18rem;
		left: 0.18rem;
		width: 0.84rem;
		height: 0.84rem;
		border-radius: 50%;
		background: color-mix(in oklab, var(--btn-content) 70%, var(--page-bg));
		transition: transform 0.2s ease, background-color 0.2s ease;
	}

	.toggle-control input:checked + .toggle-track {
		background: color-mix(in oklab, var(--primary) 78%, var(--btn-regular-bg));
	}

	.toggle-control input:checked + .toggle-track span {
		transform: translateX(0.9rem);
		background: var(--deep-text);
	}

	.toggle-control strong,
	.toggle-control small {
		display: block;
	}

	.toggle-control strong {
		font-size: 0.76rem;
	}

	.toggle-control small {
		margin-top: 0.1rem;
		font-size: 0.64rem;
		color: color-mix(in oklab, currentColor 42%, transparent);
	}

	.body-field textarea {
		min-height: 31rem;
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.78rem;
		line-height: 1.75;
		tab-size: 2;
	}

	.body-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.body-label small {
		font-family: "JetBrains Mono Variable", monospace;
		font-weight: 400;
	}

	.preview-panel {
		display: grid;
		gap: 1rem;
	}

	.preview-surface,
	.publish-card {
		overflow: hidden;
	}

	.preview-toolbar {
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--line-divider);
		background: color-mix(in oklab, var(--float-panel-bg) 70%, transparent);
	}

	.preview-toolbar strong {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.85rem;
	}

	.viewport-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.55rem;
		border-radius: 0.5rem;
		background: var(--btn-regular-bg);
		font-size: 0.66rem;
	}

	.publish-card {
		padding: 1rem;
	}

	.auth-session {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		margin-top: 0.9rem;
		padding: 0.7rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.72rem;
		background: color-mix(in oklab, var(--btn-regular-bg) 72%, transparent);
	}

	.auth-session.connected {
		border-color: color-mix(in oklab, oklch(0.7 0.13 155) 28%, transparent);
		background: color-mix(in oklab, oklch(0.7 0.13 155) 8%, var(--btn-regular-bg));
	}

	.auth-session > :global(svg) {
		font-size: 1.25rem;
		color: var(--primary);
	}

	.auth-copy,
	.auth-copy strong,
	.auth-copy small {
		display: block;
		min-width: 0;
	}

	.auth-copy strong {
		overflow: hidden;
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.auth-copy small {
		margin-top: 0.12rem;
		font-size: 0.62rem;
		color: color-mix(in oklab, currentColor 46%, transparent);
	}

	.auth-session .auth-action {
		width: auto;
		min-width: 2.8rem;
		padding: 0 0.55rem;
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--primary);
	}

	.publish-header > span {
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.78rem;
		color: var(--primary);
	}

	.progress-track {
		height: 0.28rem;
		overflow: hidden;
		margin-top: 0.85rem;
		border-radius: 999px;
		background: var(--btn-regular-bg);
	}

	.progress-track span {
		display: block;
		width: 100%;
		height: 100%;
		transform-origin: left center;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--primary), oklch(0.7 0.13 calc(var(--hue) + 38)));
		transition: transform 0.32s ease;
		will-change: transform;
	}

	.publish-steps {
		display: grid;
		gap: 0;
		margin: 1rem 0;
		padding: 0;
		list-style: none;
	}

	.publish-steps li {
		position: relative;
		display: grid;
		grid-template-columns: 1.8rem 1fr;
		gap: 0.65rem;
		min-height: 3.3rem;
	}

	.publish-steps li:not(:last-child)::after {
		position: absolute;
		top: 1.55rem;
		bottom: 0.1rem;
		left: 0.86rem;
		width: 1px;
		content: "";
		background: var(--line-divider);
	}

	.step-marker {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.55rem;
		background: var(--btn-regular-bg);
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.65rem;
		font-weight: 700;
		color: color-mix(in oklab, currentColor 46%, transparent);
	}

	.publish-steps li.done .step-marker {
		background: color-mix(in oklab, var(--primary) 20%, var(--btn-regular-bg));
		color: var(--primary);
	}

	.publish-steps strong,
	.publish-steps small {
		display: block;
	}

	.publish-steps strong {
		font-size: 0.76rem;
	}

	.publish-steps small {
		margin-top: 0.15rem;
		font-size: 0.64rem;
		color: color-mix(in oklab, currentColor 42%, transparent);
	}

	.validation-box {
		padding: 0.75rem;
		border: 1px solid color-mix(in oklab, oklch(0.65 0.2 25) 28%, transparent);
		border-radius: 0.72rem;
		background: color-mix(in oklab, oklch(0.65 0.2 25) 9%, var(--btn-regular-bg));
		font-size: 0.7rem;
	}

	.validation-box.valid {
		border-color: color-mix(in oklab, oklch(0.7 0.13 155) 28%, transparent);
		background: color-mix(in oklab, oklch(0.7 0.13 155) 9%, var(--btn-regular-bg));
	}

	.validation-box strong {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.validation-box span {
		display: block;
		margin-top: 0.35rem;
		color: color-mix(in oklab, currentColor 54%, transparent);
	}

	.validation-box ul {
		margin: 0.45rem 0 0;
		padding-left: 1rem;
		color: color-mix(in oklab, currentColor 60%, transparent);
	}

	.publish-link {
		width: 100%;
		margin-top: 0.75rem;
	}

	.studio-notice {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 80;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		width: min(26rem, calc(100vw - 2rem));
		padding: 0.8rem 0.9rem;
		font-size: 0.75rem;
	}

	.studio-notice > :global(svg) {
		font-size: 1.1rem;
		color: var(--primary);
	}

	.studio-notice button {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 0.5rem;
		background: var(--btn-regular-bg);
	}

	@media (max-width: 1180px) {
		.studio-topbar {
			grid-template-columns: 1fr auto;
		}

		.topbar-state {
			display: none;
		}

		.studio-grid {
			grid-template-columns: 16rem minmax(0, 1fr);
		}

		.preview-panel {
			grid-column: 2;
			grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.8fr);
		}

		.article-panel {
			grid-row: span 2;
		}
	}

	@media (max-width: 900px) {
		.admin-studio {
			width: min(100% - 1rem, 52rem);
			padding-top: 0.5rem;
		}

		.studio-topbar {
			top: 0.35rem;
			min-height: 4rem;
			padding: 0.55rem;
		}

		.studio-brand span,
		.topbar-actions .button-quiet:not(.icon-button),
		.topbar-actions .button-primary span,
		.topbar-user > span {
			display: none;
		}

		.studio-button {
			width: 2.5rem;
			padding: 0;
		}

		.mobile-tabs {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			position: sticky;
			top: 5rem;
			z-index: 35;
		}

		.studio-grid {
			display: block;
			margin-top: 0.75rem;
		}

		.studio-panel {
			display: none;
		}

		.studio-panel.mobile-active {
			display: block;
		}

		.article-panel {
			position: static;
		}

		.post-list {
			max-height: none;
		}

		.preview-panel.mobile-active {
			display: grid;
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.studio-brand strong {
			font-size: 0.82rem;
		}

		.brand-mark {
			width: 2.35rem;
			height: 2.35rem;
		}

		.metadata-grid,
		.metadata-grid-wide,
		.toggle-row {
			grid-template-columns: 1fr;
		}

		.editor-heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.editor-heading-actions {
			width: 100%;
		}

		.editor-heading-actions .studio-button {
			width: auto;
			flex: 1;
			padding: 0 0.55rem;
		}

		.title-field input {
			font-size: 1.1rem;
		}

		.body-field textarea {
			min-height: 24rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-track span,
		.toggle-track span {
			transition: none;
		}
	}
</style>

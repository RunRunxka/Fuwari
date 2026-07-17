<script lang="ts">
import type { AdminAsset, AdminAssetRole } from "@/types/admin";
import Icon from "@iconify/svelte";
import {
	fetchAdminAssets,
	formatAssetBytes,
	prepareAdminAsset,
	uploadAdminAsset,
} from "@utils/admin-asset-utils";
import { onDestroy, onMount } from "svelte";

export let open = false;
export let apiBase = "";
export let sessionToken = "";
export let postSlug = "";
export let role: AdminAssetRole = "content";
export let initialFile: File | null = null;
export let onClose: () => void = () => {};
export let onSelect: (asset: AdminAsset, alt: string) => void = () => {};

let assets: AdminAsset[] = [];
let cursor: string | null = null;
let currentOnly = true;
let query = "";
let loading = false;
let loadingMore = false;
let uploading = false;
let errorMessage = "";
let selectedAsset: AdminAsset | null = null;
let selectedFile: File | null = null;
let selectedFileUrl = "";
let altText = "";
let fileInput: HTMLInputElement;
let loadedKey = "";
let consumedInitialFile: File | null = null;

$: normalizedQuery = query.trim().toLowerCase();
$: visibleAssets = assets.filter((asset) => {
	if (!normalizedQuery) return true;
	return [asset.originalName, asset.alt, asset.postSlug]
		.join(" ")
		.toLowerCase()
		.includes(normalizedQuery);
});
$: listKey = `${postSlug}:${currentOnly ? "current" : "all"}`;
$: if (open && sessionToken && listKey !== loadedKey) {
	loadedKey = listKey;
	void loadAssets(false);
}
$: if (!open && loadedKey) loadedKey = "";
$: if (open && initialFile && initialFile !== consumedInitialFile) {
	consumedInitialFile = initialFile;
	setSelectedFile(initialFile);
}

function setSelectedFile(file: File | null): void {
	if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
	selectedFile = file;
	selectedFileUrl = file ? URL.createObjectURL(file) : "";
	selectedAsset = null;
	errorMessage = "";
	if (file && !altText && role === "content") {
		altText = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
	}
}

async function loadAssets(append: boolean): Promise<void> {
	if (!sessionToken || !apiBase) return;
	if (append) loadingMore = true;
	else loading = true;
	errorMessage = "";
	try {
		const result = await fetchAdminAssets(
			apiBase,
			sessionToken,
			currentOnly ? postSlug : "",
			append ? cursor || "" : "",
		);
		assets = append ? [...assets, ...result.assets] : result.assets;
		cursor = result.cursor;
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "素材列表加载失败";
	} finally {
		loading = false;
		loadingMore = false;
	}
}

function handleFileInput(event: Event): void {
	const input = event.currentTarget as HTMLInputElement;
	setSelectedFile(input.files?.[0] ?? null);
}

function handleDrop(event: DragEvent): void {
	event.preventDefault();
	const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
		item.type.startsWith("image/"),
	);
	if (file) setSelectedFile(file);
}

function selectExisting(asset: AdminAsset): void {
	setSelectedFile(null);
	selectedAsset = asset;
	altText = asset.alt;
	errorMessage = "";
}

function confirmExisting(): void {
	if (!selectedAsset) return;
	if (role === "content" && !altText.trim()) {
		errorMessage = "请为正文图片填写替代文字";
		return;
	}
	onSelect(selectedAsset, altText.trim());
	onClose();
}

async function uploadSelectedFile(): Promise<void> {
	if (!selectedFile || uploading) return;
	if (role === "content" && !altText.trim()) {
		errorMessage = "请为正文图片填写替代文字";
		return;
	}
	uploading = true;
	errorMessage = "";
	try {
		const prepared = await prepareAdminAsset(selectedFile, role);
		const asset = await uploadAdminAsset(
			apiBase,
			sessionToken,
			prepared,
			postSlug,
			role,
			altText.trim(),
		);
		onSelect(asset, altText.trim());
		onClose();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "图片上传失败";
	} finally {
		uploading = false;
	}
}

function handleKeydown(event: KeyboardEvent): void {
	if (open && event.key === "Escape") requestClose();
}

function requestClose(): void {
	if (!uploading) onClose();
}

onMount(() => {
	window.addEventListener("keydown", handleKeydown);
});

onDestroy(() => {
	window.removeEventListener("keydown", handleKeydown);
	if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
});
</script>

{#if open}
	<div class="asset-layer">
		<button class="asset-backdrop" type="button" aria-label="关闭素材库" onclick={requestClose}></button>
		<dialog open class="asset-drawer card-base" aria-modal="true" aria-label="图片素材库">
			<header class="drawer-header">
				<div class="drawer-title">
					<span class="film-mark"><Icon icon="material-symbols:photo-library-outline-rounded" /></span>
					<div>
						<span>Fuwari 素材胶片</span>
						<h2>{role === "cover" ? "选择文章封面" : "插入正文图片"}</h2>
					</div>
				</div>
				<button class="icon-button" type="button" aria-label="关闭素材库" disabled={uploading} onclick={requestClose}>
					<Icon icon="material-symbols:close-rounded" />
				</button>
			</header>

			<div class="drawer-scroll">
				<section class="upload-strip">
					<div
						class:has-file={Boolean(selectedFile)}
						class="drop-zone"
						role="button"
						tabindex="0"
						onclick={() => fileInput.click()}
						onkeydown={(event) => {
							if (event.key === "Enter" || event.key === " ") fileInput.click();
						}}
						ondragover={(event) => event.preventDefault()}
						ondrop={handleDrop}
					>
						{#if selectedFileUrl}
							<img src={selectedFileUrl} alt="待上传图片预览" />
						{:else}
							<Icon icon="material-symbols:add-photo-alternate-outline-rounded" />
						{/if}
						<span>
							<strong>{selectedFile ? selectedFile.name : "拖入、粘贴或选择图片"}</strong>
							<small>{selectedFile ? formatAssetBytes(selectedFile.size) : "JPEG / PNG / WebP / AVIF · 原图上限 20 MB"}</small>
						</span>
						<input bind:this={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onchange={handleFileInput} />
					</div>

					{#if selectedFile}
						<div class="upload-fields">
							<label>
								<span>{role === "content" ? "替代文字（必填）" : "图片说明（可选）"}</span>
								<input bind:value={altText} maxlength="240" placeholder="简短描述图片内容" />
							</label>
							<button class="primary-button" type="button" disabled={uploading} onclick={uploadSelectedFile}>
								<Icon icon={uploading ? "material-symbols:progress-activity" : "material-symbols:cloud-upload-outline-rounded"} />
								{uploading ? "正在压缩并上传" : role === "cover" ? "上传并设为封面" : "上传并插入正文"}
							</button>
						</div>
					{/if}
				</section>

				<section class="library-section">
					<div class="library-toolbar">
						<div class="scope-switch" aria-label="素材范围">
							<button class:active={currentOnly} type="button" onclick={() => (currentOnly = true)}>本篇文章</button>
							<button class:active={!currentOnly} type="button" onclick={() => (currentOnly = false)}>全部素材</button>
						</div>
						<label class="search-field">
							<Icon icon="material-symbols:search-rounded" />
							<input bind:value={query} placeholder="搜索文件、说明或文章路径" />
						</label>
					</div>

					{#if loading}
						<div class="library-state"><Icon icon="material-symbols:progress-activity" /><span>正在展开胶片…</span></div>
					{:else if visibleAssets.length === 0}
						<div class="library-state empty">
							<Icon icon="material-symbols:photo-library-outline-rounded" />
							<strong>{normalizedQuery ? "没有匹配的图片" : currentOnly ? "这篇文章还没有素材" : "素材库还是空的"}</strong>
							<span>从上方选择图片，上传后会安全保存在 R2。</span>
						</div>
					{:else}
						<div class="asset-grid">
							{#each visibleAssets as asset (asset.key)}
								<button
									class:selected={selectedAsset?.key === asset.key}
									class="asset-card"
									type="button"
									onclick={() => selectExisting(asset)}
								>
									<span class="asset-frame"><img src={asset.url} alt={asset.alt} loading="lazy" /></span>
									<span class="asset-caption">
										<strong>{asset.alt || asset.originalName || "未命名图片"}</strong>
										<small>{asset.postSlug} · {formatAssetBytes(asset.size)}</small>
									</span>
									{#if asset.role === "cover"}<span class="role-chip">封面</span>{/if}
								</button>
							{/each}
						</div>
						{#if cursor}
							<button class="load-more" type="button" disabled={loadingMore} onclick={() => loadAssets(true)}>
								{loadingMore ? "正在加载…" : "继续展开胶片"}
							</button>
						{/if}
					{/if}
				</section>
			</div>

			{#if errorMessage}
				<div class="drawer-error" role="alert"><Icon icon="material-symbols:error-outline-rounded" />{errorMessage}</div>
			{/if}

			{#if selectedAsset}
				<footer class="selection-footer">
					<label>
						<span>{role === "content" ? "替代文字（必填）" : "图片说明（可选）"}</span>
						<input bind:value={altText} maxlength="240" placeholder="简短描述图片内容" />
					</label>
					<button class="primary-button" type="button" onclick={confirmExisting}>
						<Icon icon="material-symbols:check-rounded" />
						{role === "cover" ? "设为封面" : "插入正文"}
					</button>
				</footer>
			{/if}
		</dialog>
	</div>
{/if}

<style>
	.asset-layer {
		position: fixed;
		inset: 0;
		z-index: 100;
	}

	.asset-backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		background: color-mix(in oklab, black 42%, transparent);
		backdrop-filter: blur(5px);
	}

	.asset-drawer {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		bottom: 0.75rem;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto auto;
		width: min(43rem, calc(100vw - 1.5rem));
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-color: color-mix(in oklab, var(--primary) 30%, var(--line-divider));
		box-shadow: 0 1.5rem 5rem color-mix(in oklab, black 28%, transparent);
		animation: drawer-in 0.34s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.drawer-header,
	.drawer-title,
	.library-toolbar,
	.selection-footer,
	.upload-fields,
	.drawer-error {
		display: flex;
		align-items: center;
	}

	.drawer-header {
		justify-content: space-between;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--line-divider);
		background:
			radial-gradient(circle at 0.42rem 0.38rem, var(--page-bg) 0 0.13rem, transparent 0.14rem) 0 0 / 0.84rem 0.76rem,
			color-mix(in oklab, var(--float-panel-bg) 90%, transparent);
	}

	.drawer-title {
		gap: 0.72rem;
	}

	.drawer-title > div > span {
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.drawer-title h2 {
		margin: 0.12rem 0 0;
		font-size: 1rem;
	}

	.film-mark,
	.icon-button {
		display: grid;
		place-items: center;
	}

	.film-mark {
		width: 2.55rem;
		height: 2.55rem;
		border-radius: 0.78rem;
		background: var(--primary);
		color: color-mix(in oklab, var(--deep-text) 82%, black);
		font-size: 1.3rem;
	}

	.icon-button {
		width: 2.35rem;
		height: 2.35rem;
		border-radius: 0.68rem;
		background: var(--btn-regular-bg);
		font-size: 1.1rem;
	}

	.drawer-scroll {
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.upload-strip,
	.library-section {
		padding: 1rem;
	}

	.upload-strip {
		border-bottom: 1px solid var(--line-divider);
		background: color-mix(in oklab, var(--btn-regular-bg) 35%, transparent);
	}

	.drop-zone {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.8rem;
		min-height: 6.2rem;
		padding: 0.72rem;
		border: 1px dashed color-mix(in oklab, var(--primary) 44%, var(--line-divider));
		border-radius: 0.88rem;
		background: color-mix(in oklab, var(--primary) 5%, var(--float-panel-bg));
		cursor: pointer;
	}

	.drop-zone:hover,
	.drop-zone:focus-visible {
		border-color: var(--primary);
		outline: 2px solid color-mix(in oklab, var(--primary) 15%, transparent);
	}

	.drop-zone > :global(svg) {
		margin-left: 0.55rem;
		font-size: 2rem;
		color: var(--primary);
	}

	.drop-zone img {
		width: 5.4rem;
		height: 4.7rem;
		border-radius: 0.62rem;
		object-fit: cover;
	}

	.drop-zone strong,
	.drop-zone small {
		display: block;
	}

	.drop-zone strong {
		overflow: hidden;
		font-size: 0.78rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drop-zone small {
		margin-top: 0.25rem;
		font-size: 0.65rem;
		color: color-mix(in oklab, currentColor 48%, transparent);
	}

	.drop-zone input {
		display: none;
	}

	.upload-fields {
		align-items: end;
		gap: 0.65rem;
		margin-top: 0.72rem;
	}

	.upload-fields label,
	.selection-footer label {
		min-width: 0;
		flex: 1;
	}

	.upload-fields label > span,
	.selection-footer label > span {
		display: block;
		margin-bottom: 0.34rem;
		font-size: 0.64rem;
		font-weight: 700;
		color: color-mix(in oklab, currentColor 56%, transparent);
	}

	.upload-fields input,
	.selection-footer input,
	.search-field input {
		width: 100%;
		min-height: 2.55rem;
		padding: 0 0.72rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.68rem;
		background: var(--btn-regular-bg);
		color: var(--btn-content);
		font-size: 0.74rem;
	}

	.primary-button,
	.load-more {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		min-height: 2.55rem;
		padding: 0 0.85rem;
		border-radius: 0.68rem;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.primary-button {
		background: var(--primary);
		color: color-mix(in oklab, var(--deep-text) 82%, black);
	}

	.primary-button:disabled,
	.icon-button:disabled,
	.load-more:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.library-toolbar {
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.85rem;
	}

	.scope-switch {
		display: flex;
		padding: 0.2rem;
		border-radius: 0.68rem;
		background: var(--btn-regular-bg);
	}

	.scope-switch button {
		min-height: 2.12rem;
		padding: 0 0.7rem;
		border-radius: 0.52rem;
		font-size: 0.68rem;
		font-weight: 700;
		color: color-mix(in oklab, currentColor 50%, transparent);
	}

	.scope-switch button.active {
		background: var(--float-panel-bg);
		color: var(--primary);
		box-shadow: 0 0.1rem 0.5rem color-mix(in oklab, black 9%, transparent);
	}

	.search-field {
		position: relative;
		width: min(17rem, 48%);
	}

	.search-field > :global(svg) {
		position: absolute;
		top: 50%;
		left: 0.7rem;
		transform: translateY(-50%);
		color: color-mix(in oklab, currentColor 40%, transparent);
	}

	.search-field input {
		padding-left: 2rem;
	}

	.asset-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.asset-card {
		position: relative;
		overflow: hidden;
		padding: 0.36rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--btn-regular-bg) 72%, transparent);
		text-align: left;
	}

	.asset-card:hover,
	.asset-card.selected {
		border-color: var(--primary);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 14%, transparent);
	}

	.asset-frame {
		display: block;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 0.56rem;
		background: var(--page-bg);
	}

	.asset-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.25s ease;
	}

	.asset-card:hover .asset-frame img {
		transform: scale(1.035);
	}

	.asset-caption {
		display: block;
		padding: 0.48rem 0.3rem 0.24rem;
	}

	.asset-caption strong,
	.asset-caption small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.asset-caption strong {
		font-size: 0.7rem;
	}

	.asset-caption small {
		margin-top: 0.2rem;
		font-family: "JetBrains Mono Variable", monospace;
		font-size: 0.56rem;
		color: color-mix(in oklab, currentColor 44%, transparent);
	}

	.role-chip {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		padding: 0.2rem 0.4rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--page-bg) 82%, transparent);
		font-size: 0.56rem;
		font-weight: 700;
		color: var(--primary);
		backdrop-filter: blur(6px);
	}

	.library-state {
		display: grid;
		place-items: center;
		min-height: 13rem;
		text-align: center;
		color: color-mix(in oklab, currentColor 48%, transparent);
	}

	.library-state > :global(svg) {
		font-size: 1.8rem;
		color: var(--primary);
	}

	.library-state strong,
	.library-state span {
		display: block;
	}

	.library-state strong {
		font-size: 0.76rem;
	}

	.library-state span {
		font-size: 0.66rem;
	}

	.load-more {
		width: 100%;
		margin-top: 0.8rem;
		background: var(--btn-regular-bg);
		color: var(--btn-content);
	}

	.drawer-error {
		gap: 0.45rem;
		padding: 0.65rem 1rem;
		border-top: 1px solid color-mix(in oklab, oklch(0.65 0.2 25) 28%, transparent);
		background: color-mix(in oklab, oklch(0.65 0.2 25) 10%, var(--float-panel-bg));
		font-size: 0.68rem;
		color: color-mix(in oklab, oklch(0.7 0.18 25) 78%, currentColor);
	}

	.selection-footer {
		align-items: end;
		gap: 0.65rem;
		padding: 0.78rem 1rem;
		border-top: 1px solid var(--line-divider);
		background: color-mix(in oklab, var(--float-panel-bg) 94%, transparent);
	}

	@keyframes drawer-in {
		from {
			opacity: 0;
			transform: translateX(1.5rem) scale(0.985);
		}
	}

	@media (max-width: 640px) {
		.asset-drawer {
			top: 3rem;
			right: 0.25rem;
			bottom: 0.25rem;
			width: calc(100vw - 0.5rem);
		}

		.library-toolbar,
		.upload-fields,
		.selection-footer {
			align-items: stretch;
			flex-direction: column;
		}

		.search-field {
			width: 100%;
		}

		.asset-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.primary-button {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.asset-drawer {
			animation: none;
		}

		.asset-frame img {
			transition: none;
		}
	}
</style>

<script lang="ts">
import Icon from "@iconify/svelte";
import {
	getBgBlur,
	getDefaultHue,
	getDevMode,
	getDevServer,
	getHideBg,
	getHue,
	getRainbowMode,
	getRainbowSpeed,
	getThemeMode,
	resolveEffectiveTheme,
	setBgBlur,
	setDevMode,
	setDevServer,
	setHideBg,
	setHue,
	setRainbowMode,
	setRainbowSpeed,
	setThemeMode,
} from "@utils/setting-utils";
import { onMount } from "svelte";
import { DARK_MODE, LIGHT_MODE, SYSTEM_MODE } from "@constants/constants";

const isBrowser = typeof document !== "undefined";
const defaultHue = isBrowser ? getDefaultHue() : 250;

let hue = isBrowser ? getHue() : defaultHue;
let isRainbowMode = isBrowser ? getRainbowMode() : false;
let rainbowSpeed = isBrowser ? getRainbowSpeed() : 5;
let bgBlur = isBrowser ? getBgBlur() : 4;
let hideBg = isBrowser ? getHideBg() : false;
let isDevMode = isBrowser ? getDevMode() : false;
let devServer = isBrowser ? getDevServer() : "";
let themeMode = isBrowser ? getThemeMode() : SYSTEM_MODE;
let showThemeDropdown = false;

const themeModeLabels = {
	[SYSTEM_MODE]: "跟随系统",
	[DARK_MODE]: "暗色主题",
	[LIGHT_MODE]: "日间主题",
};

const themeModeIcons = {
	[SYSTEM_MODE]: "material-symbols:settings-brightness",
	[DARK_MODE]: "material-symbols:dark-mode",
	[LIGHT_MODE]: "material-symbols:light-mode",
};

function applyTheme(mode: string) {
	themeMode = mode;
	setThemeMode(mode);
	showThemeDropdown = false;

	const html = document.documentElement;
	let isDark: boolean;
	if (mode === DARK_MODE) {
		isDark = true;
	} else if (mode === LIGHT_MODE) {
		isDark = false;
	} else {
		isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	if (isDark) {
		html.classList.add("dark");
		html.classList.remove("light");
		html.setAttribute("data-theme", "github-dark");
	} else {
		html.classList.remove("dark");
		html.classList.add("light");
		html.setAttribute("data-theme", "github-light");
	}

	// 通知 Giscus 切换主题
	const frame = document.querySelector("iframe.giscus-frame") as HTMLIFrameElement | null;
	if (frame?.contentWindow) {
		const giscusTheme = isDark ? "dark" : "light";
		frame.contentWindow.postMessage(
			{ giscus: { setConfig: { theme: giscusTheme } } },
			"https://giscus.app",
		);
	}
}

function resetHue() {
	hue = getDefaultHue();
	if (!isRainbowMode) {
		setHue(hue);
	}
}

function onHueChange() {
	if (isRainbowMode || (!hue && hue !== 0)) {
		return;
	}
	setHue(hue);
}

function onBgBlurChange() {
	setBgBlur(bgBlur);
}

function toggleRainbow() {
	isRainbowMode = !isRainbowMode;
	setRainbowMode(isRainbowMode);

	if (isRainbowMode) {
		document.documentElement.classList.add("is-rainbow-mode");
		document.documentElement.style.setProperty(
			"--rainbow-duration",
			`${120 / rainbowSpeed}s`,
		);
	} else {
		document.documentElement.classList.remove("is-rainbow-mode");
		document.documentElement.style.removeProperty("--rainbow-duration");
		setHue(hue); // Restore the static hue
	}
}

function toggleHideBg() {
	hideBg = !hideBg;
	setHideBg(hideBg);
}

function toggleDevMode() {
	isDevMode = !isDevMode;
	setDevMode(isDevMode);
}

function onDevServerChange() {
	setDevServer(devServer);
}

function onSpeedChange() {
	setRainbowSpeed(rainbowSpeed);
	if (isRainbowMode) {
		document.documentElement.style.setProperty(
			"--rainbow-duration",
			`${120 / rainbowSpeed}s`,
		);
	}
}

// 监听系统主题变化（当 themeMode 为 system 时）
function watchSystemTheme() {
	const mq = window.matchMedia("(prefers-color-scheme: dark)");
	mq.addEventListener("change", () => {
		if (getThemeMode() !== SYSTEM_MODE) return;
		const html = document.documentElement;
		if (mq.matches) {
			html.classList.add("dark");
			html.classList.remove("light");
			html.setAttribute("data-theme", "github-dark");
		} else {
			html.classList.remove("dark");
			html.classList.add("light");
			html.setAttribute("data-theme", "github-light");
		}
	});
}

onMount(() => {
	if (isRainbowMode) {
		document.documentElement.classList.add("is-rainbow-mode");
		document.documentElement.style.setProperty(
			"--rainbow-duration",
			`${120 / rainbowSpeed}s`,
		);
	}

	watchSystemTheme();
});
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute z-[90] transition-all w-80 right-4 px-4 py-4">

    <!-- 主题模式 -->
    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            主题模式
        </div>
        <button
            aria-label="切换主题模式"
            class="btn-regular rounded-md h-7 px-3 flex items-center gap-1.5 text-sm font-medium active:scale-95"
            data-theme-action="dropdown"
            onclick={() => (showThemeDropdown = !showThemeDropdown)}
        >
            <Icon icon={themeModeIcons[themeMode]} class="text-[0.95rem]" />
            <span class="text-[var(--btn-content)]">{themeModeLabels[themeMode]}</span>
            <Icon
                icon="material-symbols:expand-more-rounded"
                class="text-[1rem] text-[var(--btn-content)] transition-transform {showThemeDropdown ? 'rotate-180' : ''}"
            />
        </button>
    </div>

    {#if showThemeDropdown}
    <div class="mb-3 p-1 rounded-[var(--radius-large)] bg-[var(--card-bg)] border border-white/10 overflow-hidden transition-all">
        {#each [SYSTEM_MODE, DARK_MODE, LIGHT_MODE] as mode}
            <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)] {themeMode === mode ? 'bg-[var(--btn-plain-bg-hover)]' : ''}"
                data-theme-action="apply"
                data-theme-mode={mode}
                onclick={() => applyTheme(mode)}
            >
                <Icon icon={themeModeIcons[mode]} class="text-[1.1rem] text-[var(--primary)] shrink-0" />
                <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-[var(--btn-content)]">{themeModeLabels[mode]}</span>
                </div>
                {#if themeMode === mode}
                    <Icon icon="material-symbols:check" class="text-[1rem] text-[var(--primary)] ml-auto shrink-0" />
                {/if}
            </button>
        {/each}
    </div>
    {/if}

    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            主题色彩
            <button aria-label="Reset to Default" class="btn-regular w-7 h-7 rounded-md  active:scale-90"
                    class:opacity-0={hue === defaultHue} class:pointer-events-none={hue === defaultHue} onclick={resetHue}>
                <div class="text-[var(--btn-content)]">
                    <Icon icon="fa6-solid:arrow-rotate-left" class="text-[0.875rem]"></Icon>
                </div>
            </button>
        </div>
        <div class="flex gap-1">
            <input aria-label="Hue Value" id="hueValue" type="number" min="0" max="360" bind:value={hue} disabled={isRainbowMode}
                   oninput={onHueChange}
                   class="transition bg-[var(--btn-regular-bg)] w-12 h-7 rounded-md text-center font-bold text-sm text-[var(--btn-content)] outline-none"
            />
        </div>
    </div>
    <div class="w-full h-6 px-1 bg-[oklch(0.70_0.10_0)] rounded select-none mb-3">
        <input aria-label="主题色彩" type="range" min="0" max="360" bind:value={hue} disabled={isRainbowMode}
               oninput={onHueChange}
               class="slider" id="colorSlider" step="1" style="width: 100%">
    </div>

    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            禁用背景
        </div>
        <input aria-label="Hide Background" type="checkbox" class="toggle-switch" checked={hideBg} onchange={toggleHideBg} />
    </div>

    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            彩虹模式
        </div>
        <input aria-label="Rainbow Mode" type="checkbox" class="toggle-switch" checked={isRainbowMode} onchange={toggleRainbow} />
    </div>

    {#if isRainbowMode}
    <div class="flex flex-row gap-2 mb-3 items-center justify-between transition-all" >
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            变换速率
        </div>
        <div class="flex gap-1">
             <div class="transition bg-[var(--btn-regular-bg)] w-10 h-7 rounded-md flex justify-center
            font-bold text-sm items-center text-[var(--btn-content)]">
                {rainbowSpeed}
            </div>
        </div>
    </div>
    <div class="w-full h-6 bg-[var(--btn-regular-bg)] rounded select-none overflow-hidden">
        <input aria-label="变换速率" type="range" min="1" max="100" bind:value={rainbowSpeed} onchange={onSpeedChange}
               class="slider" step="1" style="width: 100%; --value-percent: {(rainbowSpeed - 1) / 99 * 100}%">
    </div>
    {/if}

    <div class="flex flex-row gap-2 mb-3 mt-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            背景模糊
        </div>
        <div class="flex gap-1">
            <div class="transition bg-[var(--btn-regular-bg)] w-10 h-7 rounded-md flex justify-center
            font-bold text-sm items-center text-[var(--btn-content)]">
                {bgBlur}
            </div>
        </div>
    </div>
    <div class="w-full h-6 bg-[var(--btn-regular-bg)] rounded select-none overflow-hidden">
        <input aria-label="背景模糊" type="range" min="0" max="20" bind:value={bgBlur}
               oninput={onBgBlurChange}
               class="slider" step="1" style="width: 100%; --value-percent: {bgBlur / 20 * 100}%">
    </div>

    <div class="flex flex-row gap-2 mb-3 mt-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            开发模式
        </div>
        <input aria-label="Developer Mode" type="checkbox" class="toggle-switch" checked={isDevMode} onchange={toggleDevMode} />
    </div>

    {#if isDevMode}
    <div class="flex flex-row gap-2 mb-3 items-center justify-between transition-all" >
        <div class="flex gap-2 font-bold text-lg text-[var(--btn-content)] transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            Server
        </div>
        <div class="flex gap-1">
             <input aria-label="Server Value" type="text" bind:value={devServer} oninput={onDevServerChange}
                   class="transition bg-[var(--btn-regular-bg)] w-32 h-7 rounded-md text-center font-bold text-sm text-[var(--btn-content)] outline-none"
            />
        </div>
    </div>
    {/if}
</div>

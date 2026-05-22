import { expressiveCodeConfig } from "@/config";
import { DARK_MODE, LIGHT_MODE, SYSTEM_MODE, type ThemeMode } from "@constants/constants";

export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	return Number.parseInt(configCarrier?.dataset.hue || fallback);
}

export function getHue(): number {
	const stored = localStorage.getItem("hue");
	return stored ? Number.parseInt(stored) : getDefaultHue();
}

export function setHue(hue: number, save = true): void {
	if (save) {
		localStorage.setItem("hue", String(hue));
	}
	document.documentElement.style.setProperty("--hue", String(hue));
}

export function getRainbowMode(): boolean {
	const stored = localStorage.getItem("rainbow-mode");
	return stored === "true";
}

export function setRainbowMode(enabled: boolean): void {
	localStorage.setItem("rainbow-mode", String(enabled));
}

export function getRainbowSpeed(): number {
	const stored = localStorage.getItem("rainbow-speed");
	return stored ? Number.parseFloat(stored) : 5; // Default speed
}

export function setRainbowSpeed(speed: number): void {
	localStorage.setItem("rainbow-speed", String(speed));
}

export function getBgBlur(): number {
	const stored = localStorage.getItem("bg-blur");
	return stored ? Number.parseInt(stored) : 4; // Default blur is 4
}

export function setBgBlur(blur: number): void {
	localStorage.setItem("bg-blur", String(blur));
	document.documentElement.style.setProperty("--bg-blur", `${blur / 16}rem`);
}

export function setBgHueRotate(hue: number): void {
	document.documentElement.style.setProperty("--bg-hue-rotate", `${hue}deg`);
}

export function getBgHueRotate(): number {
	const current = getComputedStyle(document.documentElement)
		.getPropertyValue("--bg-hue-rotate")
		.trim();
	return current ? Number.parseInt(current) : 0;
}

export function getHideBg(): boolean {
	const stored = localStorage.getItem("hide-bg");
	return stored === "true";
}

export function setHideBg(hide: boolean): void {
	localStorage.setItem("hide-bg", String(hide));
	document.documentElement.style.setProperty("--bg-enable", hide ? "0" : "1");
}

export function getDevMode(): boolean {
	const stored = localStorage.getItem("dev-mode");
	return stored === "true";
}

export function setDevMode(enabled: boolean): void {
	localStorage.setItem("dev-mode", String(enabled));
}

export function getDevServer(): string {
	const stored = localStorage.getItem("dev-server");
	return stored || "";
}

export function setDevServer(server: string): void {
	localStorage.setItem("dev-server", server);
}

// ===== 主题模式（system / dark / light）=====

export function getThemeMode(): ThemeMode {
	const stored = localStorage.getItem("theme-mode");
	if (stored === DARK_MODE || stored === LIGHT_MODE || stored === SYSTEM_MODE) {
		return stored;
	}
	return SYSTEM_MODE; // 默认跟随系统
}

export function setThemeMode(mode: ThemeMode): void {
	localStorage.setItem("theme-mode", mode);
}

/** 根据当前主题模式，返回实际生效的是 dark 还是 light */
export function resolveEffectiveTheme(): "dark" | "light" {
	const mode = getThemeMode();
	if (mode === DARK_MODE) return "dark";
	if (mode === LIGHT_MODE) return "light";
	// system: 跟随设备
	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		return "dark";
	}
	return "light";
}

export function applyThemeToDocument() {
	const effective = resolveEffectiveTheme();
	const html = document.documentElement;

	if (effective === "dark") {
		html.classList.add("dark");
		html.classList.remove("light");
		html.setAttribute("data-theme", expressiveCodeConfig.theme || "github-dark");
	} else {
		html.classList.remove("dark");
		html.classList.add("light");
		html.setAttribute(
			"data-theme",
			expressiveCodeConfig.lightTheme || "github-light",
		);
	}
}

export function setTheme(): void {
	applyThemeToDocument();
}

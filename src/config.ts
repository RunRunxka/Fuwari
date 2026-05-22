import type {
	ExpressiveCodeConfig,
	GitHubEditConfig,
	ImageFallbackConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
	UmamiConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";
import touxiang from "./assets/images/touxiang.png";

export const siteConfig: SiteConfig = {
	
	title: "RunRunxka's Blog",
	subtitle: "技术分享与实践",
	description:
		"RunRunxka's Blog是一个专注于IT/互联网技术分享与实践的个人技术博客，在这里你可以找到众多前沿技术的分享与实践经验。",


	keywords: ["RunRun", "润", "Xiao润", "XiaoHu", "博客", "RunRunxka Blog", "Blog", "SaSa"],
	lang: "zh_CN", // 'en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'th'
	themeColor: {
		hue: 0, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: false, // Hide the theme color picker for visitors
	},
	banner: {
		enable: false,
		src: "/xinghui.avif", // Relative to the /src directory. Relative to the /public directory if it starts with '/'

		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: true, // Display the credit text of the banner image
			text: "Pixiv @chokei", // Credit text to be displayed

			url: "https://www.pixiv.net/artworks/122782209", // (Optional) URL link to the original artwork or artist's page
		},
	},
	background: {
		enable: true, // Enable background image
		src: "https://api.dujin.org/bing/1920.php", // Background image URL (supports HTTPS)
		position: "center", // Background position: 'top', 'center', 'bottom'
		size: "cover", // Background size: 'cover', 'contain', 'auto'
		repeat: "no-repeat", // Background repeat: 'no-repeat', 'repeat', 'repeat-x', 'repeat-y'
		attachment: "fixed", // Background attachment: 'fixed', 'scroll', 'local'
		opacity: 1, // Background opacity (0-1)
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		{
			src: '/favicon/touxiang.png', // Path of the favicon, relative to the /public directory
			//   theme: 'light',              // (Optional) Either 'light' or 'dark', set only if you have different favicons for light and dark mode
			sizes: '32x32',              // (Optional) Size of the favicon, set only if you have favicons of different sizes
		},
	],
	officialSites: [
		{ url: "http://8.137.196.229:5544", alias: "CN" },
		{ url: "http://8.137.196.229:5544", alias: "Global" },
	],
	server: [
		{ url: "", text: "Blog" },
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		{
			name: "友链",
			url: "/friends/",
			external: false,
			icon: "material-symbols:group-outline-rounded",
		},
		{
			name: "赞助",
			url: "/sponsors/",
			external: false,
			icon: "material-symbols:volunteer-activism-outline-rounded",
		},
		{
			name: "工具",
			url: "/tools/",
			external: false,
			icon: "material-symbols:build-outline-rounded",
		},
		{
			name: "统计",
			url: "null",
			external: true,
			icon: "material-symbols:table-chart",
		},
		{
			name: "云盘",
			url: "http://8.137.196.229:5244",
			external: true,
			icon: "material-symbols:cloud-outline",
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: touxiang.src,
	name: "Run",
	bio: "Protect What You Love.",
	links: [
		{
			name: "QQ",
			icon: "qq", // Local icon
			url: "https://qm.qq.com/q/K8ORICe7my",
		},
		{
			name: "Telegram",
			icon: "telegram", // Local icon
			url: "https://t.me/RunR788",
		},
		{
			name: "Bilibli",
			icon: "bilibili", // Local icon
			url: "https://space.bilibili.com/501724619",
		},
		{
			name: "GitHub",
			icon: "github", // Local icon
			url: "https://github.com/RunRunxka",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const imageFallbackConfig: ImageFallbackConfig = {
	enable: false,
	originalDomain: "https://eopfapi.acofork.com/pic?img=ua",
	fallbackDomain: "https://eopfapi.acofork.com/pic?img=ua",
};

export const umamiConfig: UmamiConfig = {
	enable: true,
	baseUrl: "https://cloud.umami.is",
	shareId: "JX2ugc1owxm4gidL",
	timezone: "Asia/Shanghai",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};

export const gitHubEditConfig: GitHubEditConfig = {
	enable: true,
	baseUrl: "https://github.com/XuexGao/Fuwari/blob/main/src/content/posts",
};

// todoConfig removed from here

# RunRunxka's Blog

> 基于 [Fuwari](https://github.com/saicaca/fuwari) 深度定制的个人博客，由 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 代理运维。

<p align="center">
  <img src="https://github.com/user-attachments/assets/55c2c63b-0dac-436e-aaa0-451ad2dfb65a" width="800" alt="site preview" />
</p>

## 🔥 与原版 Fuwari 的区别

| 方面 | 原版 Fuwari | 本仓库 |
|------|-----------|--------|
| 🎨 主题色 | 紫色 (hue: 250) | 红色 (hue: 0) |
| 🌓 主题模式 | 仅暗色 | **暗色 / 日间 / 跟随系统** 三模式 |
| 📊 统计 | Umami Cloud | **自部署 Umami**（PostgreSQL，同服） |
| 🚀 部署 | Vercel / Cloudflare | **阿里云 ECS**（GitHub Actions → rsync） |
| 🤖 运维 | 手动 | **Hermes Agent 全自动**（发文、排障、监控） |
| 📂 云盘 | 无 | **集成 OpenList 文件管理器** |
| 💬 评论 | 无 | **Giscus**（GitHub Discussions） |
| 🖼️ 工具 | 无 | **封面生成器** / AI 参与度卡片 |
| 🔧 样式 | 50+ 处未适配浅色 | **全面浅色主题覆盖** + 组件级修复 |

## ✨ 特性

- 🚀 Astro 5.0+ 构建，Lighthouse 满分
- 🌓 暗色 / 日间 / 跟随系统主题切换 + 可自定义色相
- 🌈 彩虹模式
- 📝 Markdown 写作，支持 frontmatter 元数据
- 🔍 全文搜索
- 📊 文章阅读时间 + 自部署 Umami 访问统计
- 🏷️ 标签 / 分类 / 置顶
- 💬 Giscus 评论系统
- 📡 RSS / Sitemap / SEO 优化
- 🖼️ 封面生成器（图标 + 文字 + 背景图片）
- 🤖 AI 参与度标记
- 📂 导航集成 OpenList 云盘

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Astro 5.x |
| 样式 | Tailwind CSS + Stylus |
| 交互 | Svelte (传统语法) |
| 评论 | Giscus |
| 统计 | Umami v3.1.0 (自部署) |
| 部署 | GitHub Actions → rsync → 阿里云 ECS |
| 运维 | Hermes Agent |

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm dev

# 构建
pnpm build
```

## 📝 发布文章

本仓库由 Hermes Agent 代理运维，发文流程：

1. 将 `.md` 文件和图片放到 OpenList 的 `shared/` 目录
2. 告诉 Hermes："帮我发布这篇文章"
3. Hermes 自动完成：格式化 → 提交 → 推送 → CI 构建 → 部署上线

也可以手动：

```bash
# 创建文章
pnpm new-post my-post

# 提交推送
git add src/content/posts/my-post.md
git commit -m "posts:发布新文章《我的文章》。"
git push origin main
```

推送后 GitHub Actions 自动构建并 rsync 到服务器，约 1 分钟后生效。

## 🏗️ 部署架构

```
Windows 本地 (pnpm) 或 Hermes Agent (服务器)
        │
        │ git push
        ▼
   GitHub Actions
   (pnpm build)
        │
        │ rsync
        ▼
   阿里云 ECS (/home/admin/blog/)
   Python ThreadingHTTPServer :80
        │
        ▼
   http://8.137.196.229
```

配套服务（同服务器）：
- 📊 **Umami 统计** → `:3000`（PostgreSQL）
- 📂 **OpenList 云盘** → `:5244`

## 📁 项目结构

```
├── src/
│   ├── components/       # Svelte + Astro 组件
│   │   ├── CoverGenerator.svelte   # 封面生成器
│   │   ├── Search.svelte           # 全文搜索
│   │   └── widget/                 # 小部件（设置、通知等）
│   ├── content/
│   │   ├── posts/         # 博客文章 (.md)
│   │   └── assets/        # 文章图片
│   ├── layouts/           # 布局
│   ├── pages/             # 路由页面
│   ├── styles/            # CSS / Stylus
│   │   ├── main.css       # 全局样式 + 浅色主题覆盖
│   │   ├── markdown.css   # 文章渲染样式
│   │   └── variables.styl # CSS 变量（暗色/浅色双套）
│   ├── plugins/           # Remark / Rehype 插件
│   ├── scripts/           # 辅助脚本
│   └── config.ts          # 站点配置
├── .github/workflows/     # CI 部署流水线
└── scripts/               # 构建与维护脚本
```

## 🎨 自定义开发

### 主题色

`src/config.ts` → `themeColor.hue`，当前值 `0`（红色）。

### 浅色主题适配

在 `src/styles/main.css` 末尾添加 `html.light` 前缀的覆盖规则。所有 Tailwind 颜色类（`text-white/*`、`text-gray-*` 等）都需要对应覆盖，**必须加 `!important`**。

### 新增组件检查清单

```bash
# 搜索组件中使用的 Tailwind 颜色类
grep -rn 'text-white\|text-gray\|text-neutral' src/components/

# 如果有新的透明度级别，在 main.css 补充 html.light 覆盖
```

## ⚠️ 常见坑

- **Svelte 组件**：使用 `onclick` 而非 `on:click`
- **CSS 覆盖**：不加 `!important` 会被 Tailwind 级联覆盖
- **Patch 工具**：`\t` 会被写成字面量，必须用真实 tab
- **服务器 Python**：博客服务必须用 Python 3.11（系统 Python 3.6 不支持 `--directory` 且会挂死）
- **构建失败排查**：Actions 日志不可见时，回退到成功提交 → 逐个文件增量推送

## 📄 致谢

- [Fuwari](https://github.com/saicaca/fuwari) — 原始博客主题
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — AI 代理运维
- 所有为此项目做出贡献的开发者

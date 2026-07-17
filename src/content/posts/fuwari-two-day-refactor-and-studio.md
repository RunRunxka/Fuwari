---
title: "两天，把 Fuwari 博客升级成可管理的内容系统"
published: 2026-07-17T05:53
description: "记录 Fuwari 在两天内完成的安全加固、导航修复、动画优化，以及从零搭建 Studio 管理端、GitHub App 发布服务和 R2 图片素材库的全过程。"
image: "/images/fuwari-project-architecture.svg"
tags: ["Fuwari", "Astro", "Cloudflare Workers", "GitHub Actions", "工程实践"]
lang: "zh-cn"
draft: false
pinned: false
ai_level: 1
---

过去两天，我没有继续给博客堆叠新的展示效果，而是先补地基，再给它造了一间真正能工作的“内容工作室”。

7 月 16 日主要处理安全、稳定性和历史遗留问题；7 月 17 日则完成了 **Fuwari Studio**，把文章编辑、草稿、发布、删除和图片素材管理串成了一条完整链路。

| 日期 | 主题 | 最终结果 |
|---|---|---|
| 2026-07-16 | 安全与稳定性 | 自动化不再直接删数据，修复导航、SVG、统计、动画和文章历史 |
| 2026-07-17 | 内容管理能力 | 上线 Studio、GitHub App 发布服务、删除流程和 Cloudflare R2 素材库 |

这两天一共留下了 19 个独立提交。每一类修改都单独提交，方便验证，也方便在出现问题时精确回滚。

## 7 月 16 日：先把博客的地基修稳

### 自动化脚本不再替人做高风险决定

原来的友链巡检只请求一次。一次超时、DNS 抖动或者临时 `5xx`，都可能让脚本直接删除 JSON，随后 GitHub Actions 还会自动提交到主分支。

现在的策略改成了：

- 对地址进行多次重试，降低临时网络故障带来的误判；
- 同时检查 `friends` 与 `sponsors`；
- 失败后只生成 Actions 报告，不删除文件，也不写回仓库；
- 工作流只保留 `contents: read` 权限。

赞助记录也不再沿用普通友链的自动信任模型。只有仓库的 `OWNER`、`MEMBER` 或 `COLLABORATOR` 在人工核验付款凭证后，才能通过指定评论触发后续流程。

自动 PR 中所有外部地址请求也统一接入了 SSRF 防护：限制协议，检查 DNS 解析后的 IPv4 和 IPv6 地址，拒绝私网、回环、链路本地地址，并在每一次重定向后重新校验目标。

### 清理真正影响访问的坏链路

文章底部残留的 `/posts/pin/` 和 `/donate/` 已经修正，赞助入口统一指向 `/sponsors/`。页脚中没有实际脚本支持的 Cookie 更新入口也被移除，避免留下看得见却不能用的按钮。

统计代码则统一为 Umami。旧的 `pageviews.json` 生成流程、没有对应 DOM 的查询，以及另一套已经分裂的统计 API 都被删除。现在访问量只有一个来源，后续排查也更简单。

第一篇部署文章中重复附加的 HTML 正文和旧端口说明也一并清理，避免正文、RSS、搜索索引和字数统计重复。

### 恢复文章历史，并修好返回首页时消失的图标

部署工作流现在会在构建前运行 `scripts/update-diff.js`，重新生成文章修订历史。文章页保留的历史 UI 终于重新有了真实数据来源。

另一个更隐蔽的问题发生在 Swup 页面切换后：从文章返回首页时，文字和卡片都在，但部分 SVG 图标消失，浏览器后退时排序容器还可能变空。

最终处理分为三层：

1. 把常用 SVG `symbol` 放进不会被 Swup 替换的全局 Sprite；
2. 提取统一的 `repairSvgSymbols()`，在 `page:view` 和 `pageshow` 的 BFCache 恢复路径检查所有 `<use>`；
3. 独立恢复首页的排序容器，避免只补回图标却没有三个排序按钮。

代码路径已经覆盖站内点击、浏览器后退和 `pageshow.persisted`。真实 iOS、Android 返回手势仍会继续作为移动端回归项保留。

### 收窄 GSAP 生命周期

滚动动画以前会在页面切换时杀掉所有 `ScrollTrigger`，其他模块创建的触发器也会被连带清理。现在每个模块只回收自己创建的实例，并通过 `gsap.matchMedia()` 响应 `prefers-reduced-motion`。

阅读进度条也从逐帧修改 `width` 改成了 `transform: scaleX()`，减少布局计算和绘制开销。

## 7 月 17 日：从博客页面走向 Fuwari Studio

地基稳定以后，第二天的目标很明确：让文章维护不再依赖手工打开 Markdown 文件。

### 一个和前台属于同一套视觉语言的管理端

新的 `/admin/` 不是通用后台模板，而是沿用博客的色彩变量、卡片、圆角和明暗主题。它目前包含：

- 全部、草稿、已发布文章筛选；
- Markdown 编辑器与前台同步预览；
- 标题、路径、日期、标签、描述、封面等 Schema 字段；
- 本地草稿自动保存、恢复和删除；
- 已发布文章的仓库版本恢复；
- Markdown 导出与发布进度提示。

即使没有登录 GitHub，Studio 仍然可以作为本地写作工具使用；登录只影响需要访问仓库的发布和删除操作。

### GitHub App 负责发布，但不直接改 main

管理端后端运行在 Cloudflare Worker。登录使用 GitHub OAuth，Worker 再通过管理员白名单确认身份，并签发两小时有效的 Studio 会话。浏览器不会拿到 GitHub PAT、App 私钥或 installation token。

发布文章时，Worker 使用只安装到当前仓库的 GitHub App 创建分支、提交和 Draft PR。PR 创建失败时会清理临时分支；PR 还要经过内容路径与构建校验，最后由维护者人工检查并合并。

删除流程遵循同样的边界：

- 本地草稿只删除浏览器中的草稿；
- 已发布文章只创建删除用的 Draft PR；
- Worker 不直接推送或合并 `main`。

这样做比“后台点一下就直接改线上文件”多了一步，但 Git 历史、审核和回滚能力都被完整保留下来。

### 图片素材从 Git 仓库中解耦

最后补齐的是文章封面和正文图片。

Studio 现在有统一的素材抽屉：选择图片后，浏览器会先按用途缩放、移除 EXIF，并压缩为 WebP；Worker 再检查 10 MB 上限、MIME 和文件魔数，拒绝 SVG、GIF 及伪造格式。

图片最终保存到 Cloudflare R2，使用内容哈希组成不可变地址。封面可以直接回填到文章元数据，正文图片则自动插入 Markdown。

当前阶段刻意没有提供素材删除接口。原因很简单：在没有引用扫描和回收站之前，“删除图片”可能让已经发布的文章永久断图。先保证不会误删，再设计可追踪的回收流程。

## 现在的项目结构

![Fuwari 项目结构与内容发布链路](/images/fuwari-project-architecture.svg)

仓库内与这套链路直接相关的目录可以简化为：

```text
Fuwari/
├─ src/pages/                 # 博客路由与 /admin 入口
├─ src/components/admin/      # Studio 编辑器、预览与素材抽屉
├─ src/content/posts/         # Markdown 文章，唯一内容源
├─ src/scripts/               # Swup、SVG 修复与滚动动画
├─ admin-worker/              # OAuth、GitHub App、文章与 R2 API
├─ .github/workflows/         # PR 校验、构建与自动部署
├─ scripts/                   # 链接巡检与文章历史生成
└─ public/images/             # 文章公共图片
```

完整发布路径是：

```text
Studio 写作
  → Worker 校验身份
  → GitHub App 创建 Draft PR
  → 人工审阅并合并 main
  → GitHub Actions 构建 Astro
  → rsync 部署到阿里云 ECS
  → Nginx 提供静态页面
```

图片走另一条更短的路径：

```text
浏览器压缩为 WebP
  → Worker 二次校验
  → Cloudflare R2
  → 公开不可变图片地址
```

## 这两天最重要的变化

表面上看，这次只是多了一个管理页面；实际上，Fuwari 的职责边界已经重新划分：

- Astro 继续负责快速、稳定的静态博客；
- Git 仓库继续作为文章的唯一事实来源；
- Worker 只承担身份认证、受控写入和素材服务；
- GitHub PR 负责审核，Actions 负责构建；
- 阿里云继续托管最终页面，R2 单独承载图片。

这套结构没有把个人博客做成复杂的 CMS，却解决了最实际的问题：我可以在浏览器里写作和管理素材，同时仍然保留 Markdown、Git 历史、人工审核和可回滚部署。

下一步会继续完善素材引用检查与安全删除、管理端的文章修订历史，以及真实移动设备上的返回手势回归。

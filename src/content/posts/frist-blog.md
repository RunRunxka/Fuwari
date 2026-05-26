---
title: 从零部署 Fuwari 博客到阿里云服务器
published: 2026-05-22
description: 完整记录 Fuwari Astro 博客从搭建、GitHub Actions 自动部署到阿里云 ECS、配置域名与自定义的全过程。
tags: [博客, Astro, GitHub Actions, 部署, Fuwari]
category: 教程
draft: false
---

## 起因

一直想搭一个自己的博客，选了 Fuwari 这个 Astro 静态博客主题。服务器是阿里云 ECS（1.8G 内存），但是本地构建需要 7G+ 内存，服务器直接 `pnpm build` 会 OOM。所以需要一套 GitHub Actions 自动构建 + 部署的流程。

## 环境一览

| 项目 | 详情 |
|---|---|
| 博客框架 | [Fuwari](https://github.com/saicaca/fuwari) (Astro) |
| 代码托管 | GitHub (`RunRunxka/Fuwari`) |
| 服务器 | 阿里云 ECS，Alibaba Linux 8，IP `x.x.x.x` |
| 部署方式 | GitHub Actions 构建 → rsync 推送 → Python HTTP Server |
| 访问地址 | `http://x.x.x.x:5544` |

## 第一步：服务器端准备

### 安装 rsync

服务器默认没装 rsync，GitHub Actions 推送文件要用到：

```bash
sudo yum install -y rsync
```

### 配置 SSH 密钥

让 GitHub Actions 能 SSH 到服务器：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
```

私钥 `~/.ssh/github_actions` 的内容后面要填到 GitHub Secrets。

## 第二步：GitHub Actions 工作流

在仓库根目录创建 `.github/workflows/deploy.yml`：

```yaml
name: Build & Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Deploy to server
        uses: easingthemes/ssh-deploy@v6.0.3
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          ARGS: "-rlgoDzvc --delete"
          SOURCE: "dist/"
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          TARGET: "/home/admin/blog"
```

### 设置 GitHub Secrets

去仓库 `Settings → Secrets and variables → Actions`，新建三个：

| Name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | `~/.ssh/github_actions` 私钥内容 |
| `REMOTE_HOST` | `x.x.x.x` |
| `REMOTE_USER` | `admin` |

## 第三步：启动静态文件服务

构建好的文件在 `/home/admin/blog/`，用 Python 起个 HTTP 服务：

```bash
cd /home/admin/blog && python3 -m http.server 5544 --bind 0.0.0.0 &
```

### 踩坑：80 端口被 nginx 占用

阿里云 ECS 默认装了 nginx 占着 80 端口。本来想用 80 方便直接 IP 访问，结果访问显示 nginx 欢迎页。改成 5544 端口解决。

> 注意：每次加新端口都要去阿里云安全组放行！

## 第四步：自定义博客

### 修改站点配置

编辑 `src/config.ts`：

```ts
export const siteConfig: SiteConfig = {
  title: "你的博客名",
  subtitle: "副标题",
  lang: "zh_CN",
  // ...
};
```

### 修改头像和个人信息

```ts
export const profileConfig: ProfileConfig = {
  avatar: "/touxiang.png",  // 放 public/ 下避免哈希
  name: "你的名字",
  bio: "个人简介",
  links: [
    { name: "GitHub", icon: "fa6-brands:github", url: "https://github.com/xxx" },
  ],
};
```

### 踩坑：头像加载不出

原来路径写 `assets/images/touxiang.png`，构建时 Astro 会将其哈希重命名为 `_astro/touxiang.XXXX.png`，但页面仍引用原路径导致 404。

**两种解法：**

1. 移到 `public/` 目录，路径写 `/touxiang.png`（不会被哈希）
2. 在 `config.ts` 里用 `import` 引入，然后添加 `env.d.ts` 类型声明

### 创建文章

直接在 `src/content/posts/` 下建文件夹：

```
src/content/posts/
├── my-post/
│   ├── index.md
│   └── cover.jpg
```

`index.md` 示例：

```md
---
title: 文章标题
published: 2026-05-22
description: 简介
image: ./cover.jpg
tags: [标签1, 标签2]
category: 分类
draft: false
---

正文内容...
```

## 第五步：域名（可选）

买了域名 `runrunxka.xyz`，去阿里云云解析加两条 A 记录：

| 主机记录 | 记录类型 | 记录值 |
|---|---|---|
| `@` | A | `x.x.x.x` |
| `www` | A | `x.x.x.x` |

但国内服务器用域名需要 ICP 备案，否则访问被拦截提示 `Non-compliance ICP Filing`。暂时用 IP:端口方式访问。

## 总结

现在每次写完文章或改配置，只需要：

```bash
git add . && git commit -m "更新" && git push
```

GitHub Actions 自动构建并推送到服务器，一分钟内生效。全程不用碰服务器。

整个流程踩了几个坑：

1. `easingthemes/ssh-deploy` 要用 `@v6.0.3`，`@v5` 不存在
2. 服务器必须先装 rsync
3. 头像路径别用 `src/assets/`，用 `public/` 或 import
4. 国内服务器域名要备案
5. 别用 80 端口，ECS 默认 nginx 占着

希望对同样折腾 Fuwari 的朋友有帮助 🚀
<h2>第一步：服务器端准备</h2>
<h3>安装 rsync</h3>
<p>服务器默认没装 rsync，GitHub Actions 推送文件要用到：</p>
<pre><code>sudo yum install -y rsync
</code></pre>
<h3>配置 SSH 密钥</h3>
<p>让 GitHub Actions 能 SSH 到服务器：</p>
<pre><code>ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N &#34;&#34;
cat ~/.ssh/github_actions.pub &gt;&gt; ~/.ssh/authorized_keys
</code></pre>
<p>私钥 <code>~/.ssh/github_actions</code> 的内容后面要填到 GitHub Secrets。</p>
<h2>第二步：GitHub Actions 工作流</h2>
<p>在仓库根目录创建 <code>.github/workflows/deploy.yml</code>：</p>
<pre><code>name: Build &amp; Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Deploy to server
        uses: easingthemes/ssh-deploy@v6.0.3
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          ARGS: &#34;-rlgoDzvc --delete&#34;
          SOURCE: &#34;dist/&#34;
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          TARGET: &#34;/home/admin/blog&#34;
</code></pre>
<h3>设置 GitHub Secrets</h3>
<p>去仓库 <code>Settings → Secrets and variables → Actions</code>，新建三个：</p>
<p>| Name | Value |
|---|---|
| <code>SSH_PRIVATE_KEY</code> | <code>~/.ssh/github_actions</code> 私钥内容 |
| <code>REMOTE_HOST</code> | <code>x.x.x.x</code> |
| <code>REMOTE_USER</code> | <code>admin</code> |</p>
<h2>第三步：启动静态文件服务</h2>
<p>构建好的文件在 <code>/home/admin/blog/</code>，用 Python 起个 HTTP 服务：</p>
<pre><code>cd /home/admin/blog &amp;&amp; python3 -m http.server 5544 --bind 0.0.0.0 &amp;
</code></pre>
<h3>踩坑：80 端口被 nginx 占用</h3>
<p>阿里云 ECS 默认装了 nginx 占着 80 端口。本来想用 80 方便直接 IP 访问，结果访问显示 nginx 欢迎页。改成 5544 端口解决。</p>
<blockquote>
<p>注意：每次加新端口都要去阿里云安全组放行！</p>
</blockquote>
<h2>第四步：自定义博客</h2>
<h3>修改站点配置</h3>
<p>编辑 <code>src/config.ts</code>：</p>
<pre><code>export const siteConfig: SiteConfig = {
  title: &#34;你的博客名&#34;,
  subtitle: &#34;副标题&#34;,
  lang: &#34;zh_CN&#34;,
  // ...
};
</code></pre>
<h3>修改头像和个人信息</h3>
<pre><code>export const profileConfig: ProfileConfig = {
  avatar: &#34;/touxiang.png&#34;,  // 放 public/ 下避免哈希
  name: &#34;你的名字&#34;,
  bio: &#34;个人简介&#34;,
  links: [
    { name: &#34;GitHub&#34;, icon: &#34;fa6-brands:github&#34;, url: &#34;https://github.com/xxx&#34; },
  ],
};
</code></pre>
<h3>踩坑：头像加载不出</h3>
<p>原来路径写 <code>assets/images/touxiang.png</code>，构建时 Astro 会将其哈希重命名为 <code>_astro/touxiang.XXXX.png</code>，但页面仍引用原路径导致 404。</p>
<p><strong>两种解法：</strong></p>
<ol>
<li>移到 <code>public/</code> 目录，路径写 <code>/touxiang.png</code>（不会被哈希）</li>
<li>在 <code>config.ts</code> 里用 <code>import</code> 引入，然后添加 <code>env.d.ts</code> 类型声明</li>
</ol>
<h3>创建文章</h3>
<p>直接在 <code>src/content/posts/</code> 下建文件夹：</p>
<pre><code>src/content/posts/
├── my-post/
│   ├── index.md
│   └── cover.jpg
</code></pre>
<p><code>index.md</code> 示例：</p>
<pre><code>---
title: 文章标题
published: 2026-05-22
description: 简介
image: ./cover.jpg
tags: [标签1, 标签2]
category: 分类
draft: false
---

正文内容...
</code></pre>
<h2>第五步：域名（可选）</h2>
<p>买了域名 <code>runrunxka.xyz</code>，去阿里云云解析加两条 A 记录：</p>
<p>| 主机记录 | 记录类型 | 记录值 |
|---|---|---|
| <code>@</code> | A | <code>x.x.x.x</code> |
| <code>www</code> | A | <code>x.x.x.x</code> |</p>
<p>但国内服务器用域名需要 ICP 备案，否则访问被拦截提示 <code>Non-compliance ICP Filing</code>。暂时用 IP:端口方式访问。</p>
<h2>总结</h2>
<p>现在每次写完文章或改配置，只需要：</p>
<pre><code>git add . &amp;&amp; git commit -m &#34;更新&#34; &amp;&amp; git push
</code></pre>
<p>GitHub Actions 自动构建并推送到服务器，一分钟内生效。全程不用碰服务器。</p>
<p>整个流程踩了几个坑：</p>
<ol>
<li><code>easingthemes/ssh-deploy</code> 要用 <code>@v6.0.3</code>，<code>@v5</code> 不存在</li>
<li>服务器必须先装 rsync</li>
<li>头像路径别用 <code>src/assets/</code>，用 <code>public/</code> 或 import</li>
<li>国内服务器域名要备案</li>
<li>别用 80 端口，ECS 默认 nginx 占着</li>
</ol>
<p>希望对同样折腾 Fuwari 的朋友有帮助 🚀</p>

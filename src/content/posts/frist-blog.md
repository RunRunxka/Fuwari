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
| 部署方式 | GitHub Actions 构建 → rsync 推送 → Nginx 静态托管 |
| 访问地址 | `https://runrunxka.xyz` |

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

## 第三步：配置 Nginx 静态站点

构建好的文件会同步到 `/home/admin/blog/`。让 Nginx 直接提供静态文件，不再额外启动 Python HTTP Server 或暴露高位端口：

```nginx
server {
    listen 80;
    server_name runrunxka.xyz www.runrunxka.xyz;

    root /home/admin/blog;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

保存配置后检查并重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

公网只需要按实际 HTTPS 方案放行 80/443 端口。

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

国内服务器使用域名需要先完成 ICP 备案；备案、DNS 与 HTTPS 配置完成后即可通过正式域名访问。

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
5. 让 Nginx 直接托管静态文件，避免额外暴露高位端口

希望对同样折腾 Fuwari 的朋友有帮助 🚀

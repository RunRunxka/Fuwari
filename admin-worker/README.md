# Fuwari Studio 发布服务

这是管理端的独立 Cloudflare Worker。它使用 GitHub OAuth 确认操作者身份，再以 GitHub App installation token 创建文章发布、更新或删除提交及草稿 PR。

浏览器只能得到两小时有效的 Fuwari Studio 会话，不会接触 GitHub PAT、App 私钥或 installation token。

## 1. 创建 GitHub App

在 GitHub Developer settings 中新建 GitHub App：

- Homepage URL：`https://runrunxka.xyz/admin/`
- Callback URL：`https://<你的 Worker 域名>/api/auth/callback`
- Webhook：关闭
- Repository permissions：
  - Metadata：Read-only
  - Contents：Read and write
  - Pull requests：Read and write

只把 App 安装到 `RunRunxka/Fuwari`，然后记录 App ID、Client ID、Client secret 和 Installation ID，并生成一把私钥。Worker 可直接读取 GitHub 下载的 PKCS#1 `RSA PRIVATE KEY`，无需手动转换格式。

`ADMIN_GITHUB_LOGINS` 是逗号分隔的 GitHub 登录名白名单。即使其他用户完成 OAuth，也无法获得管理会话。

## 2. 配置 Worker

复制 `.dev.vars.example` 为 `.dev.vars` 可进行本地测试。`.dev.vars` 已被 Git 忽略。

生产环境使用 Wrangler secret，不要把值写进 `wrangler.jsonc`：

```powershell
pnpm dlx wrangler@latest secret put GITHUB_APP_ID --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put GITHUB_APP_INSTALLATION_ID --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put GITHUB_APP_PRIVATE_KEY --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put GITHUB_APP_CLIENT_ID --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put GITHUB_APP_CLIENT_SECRET --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put ADMIN_GITHUB_LOGINS --config admin-worker/wrangler.jsonc
pnpm dlx wrangler@latest secret put SESSION_SECRET --config admin-worker/wrangler.jsonc
```

`SESSION_SECRET` 至少 32 个随机字符。建议使用密码管理器生成 48 字节以上的随机值。

### 启用图片素材存储

Fuwari Studio 使用 Cloudflare R2 保存文章封面和正文图片。首次部署前需要先在 Cloudflare 账户中启用 R2，然后创建与 `wrangler.jsonc` 一致的 Bucket：

```powershell
pnpm dlx wrangler@latest r2 bucket create fuwari-media --config admin-worker/wrangler.jsonc
```

`MEDIA_BUCKET` 是 Worker 内部的 R2 binding，`MEDIA_PUBLIC_BASE_URL` 是公开图片地址前缀。修改 `wrangler.jsonc` 后重新生成 Worker 类型：

```powershell
pnpm dlx wrangler@latest types admin-worker/worker-configuration.d.ts --config admin-worker/wrangler.jsonc --env-interface WorkerBindings
```

## 3. 部署

```powershell
pnpm dlx wrangler@latest deploy --config admin-worker/wrangler.jsonc
```

部署后把 Worker 地址保存为 GitHub Actions 仓库变量 `PUBLIC_ADMIN_API_BASE_URL`，例如：

```text
https://fuwari-studio-api.<account>.workers.dev
```

管理端构建时会读取这个公开地址。它不是密钥。

## 安全边界

- CORS 只允许 `FRONTEND_ORIGIN`。
- OAuth 使用十分钟一次性 state Cookie。
- OAuth token 只用于读取一次登录身份，签发 Studio 会话后立即请求 GitHub 撤销。
- 管理会话使用 HMAC 签名并在两小时后过期。
- GitHub App token 被限制到单个仓库及 Contents/Pull requests 权限。
- 文章请求限制为 1 MB，文件路径只能位于 `src/content/posts`。
- 图片列表和上传接口需要有效的 Studio 管理会话，公开端只提供按内容哈希命名的图片读取地址。
- 原图在浏览器中缩放、移除 EXIF 并转为 WebP；Worker 再校验 10 MB 上限、MIME 与文件魔数，拒绝 SVG、GIF 和伪造格式。
- 图片使用不可变缓存；当前阶段不提供删除接口，避免文章仍在引用时误删素材。
- 发布、更新和删除只创建唯一分支和草稿 PR，不会直接写入或合并 `main`。
- 如果 PR 创建失败，Worker 会尝试删除刚创建的临时分支，避免留下无主分支。

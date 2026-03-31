# Manga Viewer

https://zhoudaxia2016.github.io/manga-viewer/
---

## 本地开发

需要同时跑 **Deno API** 和 **Vite 前端**（两个终端）。

1. **后端**（默认 `http://127.0.0.1:8080`）

   ```bash
   cd server
   cp .env.example .env
   # 编辑 .env 填入 R2 等变量
   deno task start
   ```

   可用环境变量 **`PORT`** 改端口（默认 `8080`）。

2. **前端**（默认 `http://127.0.0.1:5173`）

   ```bash
   cd web
   pnpm install
   pnpm dev
   ```

3. **本地不要设置 `VITE_API_URL`**（或留空）。`web/vite.config.ts` 已将 `/api` 代理到 `http://localhost:8080`，请求走同一源，避免误连本机其它端口。

---

## 生产部署：前后端配置

### 前端（GitHub Pages）

1. 在仓库 **Settings → Secrets and variables → Actions → Variables** 中设置 **`VITE_API_URL`**，值为线上 **API 根地址**（下面的deno deploy）

2. 推送到 **`main`** 会触发构建；构建步骤使用上述变量执行 `pnpm run build`。

3. 生产环境 **`base` 为 `/manga-viewer/`**（见 `web/vite.config.ts`），对应 Pages 项目站：  
   `https://<用户名>.github.io/manga-viewer/`  
   若仓库名不是 `manga-viewer`，需把 `base` 改成 `/<仓库名>/` 或按你的 Pages 路径调整。

4. Workflow 会将 `dist/index.html` 复制为 **`404.html`**，便于子路由刷新。

### 后端（自行托管）

在能跑 **Deno** 的环境部署 `server/` (deno deloy)，对外提供 **HTTPS**。进程需能访问 **R2**。

**环境变量**见 [`server/.env.example`](server/.env.example)；与本地 `server/.env` 一致，**勿提交**真实值。

启动见 `server/deno.json` 中 `deno task start`。R2 与自定义域名细节见 [`docs/cloudflare-r2-migrate-from-qiniu.md`](docs/cloudflare-r2-migrate-from-qiniu.md)。

### 检查清单

- [ ] `https://你的API域名/api/manga` 在浏览器中可访问（证书与路由正常）。
- [ ] **`VITE_API_URL`** 指向同一套 API，且为 **HTTPS**。
- [ ] 图片地址基于 **`R2_PUBLIC_BASE`**，同为 **HTTPS**。

### 故障排除：Pages 上「Failed to fetch」

静态站 **没有** `/api`，若构建时 **未设置 `VITE_API_URL`**，浏览器会请求 `https://<用户>.github.io/api/...`，必然失败。

1. 在 **仓库 → Settings → Secrets and variables → Actions → Variables** 中设置 **`VITE_API_URL`** = 你的线上 API 根地址（**`https://` 开头**，与 GitHub Pages 同为 HTTPS，避免混合内容被拦截）。
2. 保存变量后 **再推一次 `main`**（或手动 re-run workflow），让带环境变量的 `pnpm build` 重新执行。
3. 确认 Deno API 已在公网可访问，且 `https://你的API域名/api/manga` 能返回数据。

---

## 其他

- 连续上传自测（需 R2）：`cd server && deno task test:upload`
- 密钥只放环境变量或本地 `server/.env`，勿提交（见 `.gitignore`）。

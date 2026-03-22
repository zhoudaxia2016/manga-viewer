# 从七牛云迁移到 Cloudflare R2（给 Minimax / 实现者）

项目路径：`~/code/manga-viewer`。  
当前实现：`server/routes/upload.ts` 使用 **七牛表单上传**（`qiniu` npm 包 + `QINIU_*` 环境变量），上传成功后把 **`https` 可访问的图片 URL** 写入 **Deno KV**（`images[].url`）。  
前端 `web` 只请求自有 API（`/api/upload`、`/api/manga/...`），**不直连**对象存储。

目标：**用 R2（S3 兼容 API）替代七牛上传**；新写入 KV 的 `url` 必须是 **`https://` 开头**，以便 GitHub Pages 等 HTTPS 站点通过 `<img src>` 正常加载（避免混合内容）。

---

## 1. Cloudflare 控制台准备

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → **Create bucket**（名称自定，例如 `manga`）。
2. **创建 API 令牌**（R2）：需具备对该 bucket 的 **读 + 写**（Object Read & Write）。记下：
   - **Access Key ID**
   - **Secret Access Key**
3. 在 R2 概览页复制 **Account ID**（32 位十六进制）。
4. **对外访问 URL（HTTPS，必选其一）**  
   - **推荐 A**：在 bucket → **Settings** → **Public access** / **Custom Domain**，绑定 **Cloudflare 托管的域名**下子域（如 `img.example.com`），自动 **HTTPS**。  
   - **推荐 B（无自有域名时）**：开启 R2 提供的 **r2.dev 公共访问**（若控制台仍提供），得到形如 `https://pub-xxxx.r2.dev` 的基址；具体以当前控制台文案为准。  
   - 实现时增加环境变量 **`R2_PUBLIC_BASE`**（**无尾部斜杠**），最终对象 URL 为：  
      `R2_PUBLIC_BASE + '/' + key`  
      其中 `key` 格式为：`manga/${mangaName}/${chapterName}/${file.name}`。

5. （可选）在 bucket **CORS** 中允许浏览器直接 GET（当前架构主要走服务端上传，但若未来直链或调试，可配置 `GET` 来源为你的前端域名）。

参考：[R2 S3 API 兼容说明](https://developers.cloudflare.com/r2/api/s3/api/)。

---

## 2. S3 兼容端点（实现必用）

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

- **Region**：填 **`auto`**（AWS SDK 要求有 region 字段时使用 `auto`）。  
- **Bucket**：环境变量 `R2_BUCKET`。  
- **凭证**：`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。

---

## 3. 环境变量（替换七牛）

| 变量 | 说明 |
|------|------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 API Token Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret |
| `R2_BUCKET` | Bucket 名称 |
| `R2_PUBLIC_BASE` | 对外 HTTPS 基址，无尾斜杠，例如 `https://img.example.com` 或 `https://pub-xxxx.r2.dev` |

可保留或删除七牛变量：`QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY`、`QINIU_BUCKET`、`QINIU_DOMAIN`（迁移完成后从代码与部署配置中移除）。

---

## 4. 代码改动范围（最小闭环）

### 4.1 `server/deno.json`

- 增加依赖：`npm:@aws-sdk/client-s3`（版本与 Deno npm 兼容即可，例如 `^3.700.0` 一类）。  
- 迁移完成后可从 `imports` 中移除 `qiniu`（若再无引用）。

### 4.2 新建或内联：`uploadToR2`

职责与现 `uploadToQiniu` 对齐：

- 入参：`Uint8Array`（或 `ArrayBuffer`）、对象 **`key`**（格式为 `manga/${mangaName}/${chapterName}/${file.name}`）。  
- 使用 `S3Client` + `PutObjectCommand`：  
  - `Bucket`: `R2_BUCKET`  
  - `Key`: `key`  
  - `Body`: 文件二进制  
  - `ContentType`: 根据扩展名设置 `image/jpeg`、`image/png`、`image/webp`、`image/gif`（与现支持格式一致即可）。  
- 返回：字符串 **`${R2_PUBLIC_BASE}/${key}`**（若 key 含空格或 Unicode，按与七牛时期相同策略决定是否 `encodeURI` 整段 path；**保证浏览器能访问**）。

### 4.3 `server/routes/upload.ts`

- 将 `uploadToQiniu` 调用替换为 `uploadToR2`。  
- 配置校验：`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_PUBLIC_BASE` 缺一不可，否则返回 500 与明确错误信息（对齐原「Qiniu not configured」行为）。  
- **KV 结构、路由、表单字段**（`file`、`mangaName`、`chapterName`）**不变**；`existingImage` 去重逻辑不变。

### 4.4 前端 `web`

- **无需为 R2 单独改上传协议**（仍 POST `/api/upload`）。  
- 若生产环境通过 `VITE_API_URL` 指 API，保持不变即可。

---

## 5. 数据迁移说明（可选）

- **已存在 KV 中的旧数据**：`images[].url` 仍指向七牛 HTTP/不可用 HTTPS 的域名时，GitHub Pages 上仍会混合内容失败。  
- 可选方案：  
  - **只迁移新上传**：旧漫画重新 ZIP 上传覆盖；或  
  - **写一次性脚本**：读 KV，把七牛 URL 下载后再写入 R2 并更新 `url`（工作量大，按需）。

文档层面提醒维护者即可，不必在本次必做。

---

## 6. 验收清单

- [ ] 本地 `deno task start`，带齐 `R2_*` 环境变量。  
- [ ] 通过前端或 `curl` 上传一张图，`KV` 中 `url` 为 **`https://...`**。  
- [ ] 浏览器新标签直接打开该 URL 能显示图片。  
- [ ] `https://<你的 GitHub Pages>/reader` 中图片能加载（需 `VITE_API_URL` 指向可达的 HTTPS API，且返回的 `url` 为 HTTPS）。  
- [ ] 移除七牛依赖与未使用代码后 `deno check` / 启动无报错。

---

## 7. 与七牛行为的差异（实现时注意）

| 项目 | 七牛（现） | R2（目标） |
|------|------------|------------|
| 协议 | 表单 POST 到 `upload-z2.qiniup.com` | S3 `PutObject` 到 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| 返回 URL | `QINIU_DOMAIN` + `/` + key | `R2_PUBLIC_BASE` + `/` + key |
| 凭证 | AK/SK + bucket | S3 兼容 Access Key / Secret |

---

## 8. 参考链接

- R2 S3 API：<https://developers.cloudflare.com/r2/api/s3/api/>  
- AWS SDK for JavaScript v3 `S3Client`：<https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/>  
- R2 自定义域名绑定：<https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains>

---

实现完成后，可在 `docs/qiniu-kodo-image-upload.md` 文首加一句「上传已切换 R2，七牛文档仅作历史参考」，避免混淆。

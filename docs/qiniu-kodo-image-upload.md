# 七牛云对象存储（Kodo）图片上传实现说明（给 AI / 开发者）

本文描述**浏览器 / 小程序 / App 客户端直传**七牛的标准做法：**业务服务端签发上传凭证（uploadToken）**，客户端用 **multipart 表单** POST 到七牛上传域名。按本文实现可避免常见的 **HTTP 400**（报文格式错误、区域域名不匹配等）。

---

## 1. 整体流程（必须遵守）

1. **客户端**向**你的业务后端**请求「上传凭证」：可附带期望的文件名前缀、业务 ID 等。
2. **业务后端**用 **AccessKey + SecretKey** 生成 **uploadToken**（上传凭证），**仅返回 token 与建议的 `key`（对象名）**，**绝不**把 SecretKey 下发给客户端。
3. **客户端**构造 `multipart/form-data`，字段包含 **`file`**、**`token`**，按需带 **`key`** 等，POST 到**与 Bucket 区域一致**的上传域名。
4. 七牛返回 **200** 且 body 为 JSON（含 `hash`、`key` 等）；客户端再把 `key` 或访问 URL 回传你的业务库。

---

## 2. 上传接口：表单上传（Form Upload）

- **方法**：`POST`
- **Content-Type**：`multipart/form-data`（由客户端库自动生成 boundary，**不要**手写为 `application/json`）
- **URL**：必须使用下表与 **Bucket 所在区域** 对应的 **上传域名**（用错常报 **400**，错误信息里可能出现 `incorrect region`）

### 2.1 上传域名与区域对应（务必核对控制台里 Bucket 的区域）

| 区域（常见控制台名称） | 上传域名（HTTPS） |
|------------------------|-------------------|
| 华东-浙江（z0） | `https://upload.qiniup.com` |
| 华北-河北（z1） | `https://upload-z1.qiniup.com` |
| 华南-广东（z2） | `https://upload-z2.qiniup.com` |
| 北美（na0） | `https://upload-na0.qiniup.com` |
| 亚太-新加坡（as0） | `https://upload-as0.qiniup.com` |

说明：若文档或旧代码仍写 `http://up.qiniu.com`，请改为上表 **HTTPS + 正确区域**，否则易 400 或不稳定。

### 2.2 表单字段（名称必须一致）

| 字段名 | 是否必填 | 说明 |
|--------|----------|------|
| `file` | **必填** | 文件二进制；在 multipart 里必须是**文件部件**（有 filename / 文件流） |
| `token` | **必填** | 服务端生成的 uploadToken 字符串 |
| `key` | 视策略而定 | 对象在 Bucket 中的路径/文件名，如 `images/2025/xxx.jpg`。若 token 的 scope 限定到具体 key，则必须与 scope 一致 |

可选字段（一般图片直传可暂忽略，需要时再查官方「表单上传」文档）：`crc32`、`accept`、`x:自定义变量` 等。

**禁止**：把整个请求体做成 JSON `{"file":...}` —— 七牛表单上传只认 **multipart**。

---

## 3. 服务端：生成 uploadToken（上传凭证）

### 3.1 策略要点（PutPolicy）

uploadToken 由 **PutPolicy（JSON）** 经 AccessKey/SecretKey 签名后，再按七牛规则编码得到。策略里常见字段：

- **`scope`**：`<bucket>` 或 `<bucket>:<key>`  
  - 仅 `bucket`：允许上传任意 key（仍建议客户端传明确 `key` 便于管理）。  
  - `bucket:key`：只能上传到该固定 key（覆盖上传场景）。
- **`deadline`**：Unix 时间戳（**秒**），必须大于当前时间，例如现在 + 3600。
- 其他按需：`returnBody`、`saveKey`、`mimeLimit`、`fsizeLimit` 等。

**常见坑**：

- `deadline` 用成毫秒 → token 立即无效或行为异常。
- `scope` 写死为 `bucket:某key`，但客户端上传用了另一个 `key` → 易 **403**（与 400 不同，但易混淆）。
- 服务器时间偏差过大 → token 失效。

### 3.2 推荐：用官方 SDK 生成 token（不要手写签名除非你很熟）

**Node.js 示例（需安装 `qiniu` 包，版本与官方文档保持一致）：**

```javascript
const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const bucket = '你的空间名';

const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const options = {
  scope: bucket,
  deadline: Math.floor(Date.now() / 1000) + 3600,
};
const putPolicy = new qiniu.rs.PutPolicy(options);
const uploadToken = putPolicy.uploadToken(mac);
// 将 uploadToken + 建议的 key 返回给前端
```

**Python**：使用 `qiniu` PyPI 包中的 `Auth.upload_token(bucket, key, expires)` 同理。

---

## 4. 客户端：构造 multipart 请求

### 4.1 浏览器（Fetch + FormData）

```javascript
const form = new FormData();
form.append('token', uploadToken);
form.append('key', objectKey); // 如 images/2025/03/abc.jpg
form.append('file', fileBlobOrFile, filename); // 第三个参数建议给真实文件名，含扩展名

const uploadHost = 'https://upload.qiniup.com'; // 按 Bucket 区域替换
const res = await fetch(uploadHost, { method: 'POST', body: form });
const text = await res.text();
if (!res.ok) throw new Error(`upload failed ${res.status}: ${text}`);
const data = JSON.parse(text);
// data.key, data.hash
```

注意：

- **不要**设置 `Content-Type: multipart/...` 头（交给 `fetch` 带 boundary）。
- `file` 必须是 `File` / `Blob`；若只有 base64，请先转成 `Blob` 再 append。

### 4.2 axios

```javascript
const form = new FormData();
form.append('token', uploadToken);
form.append('key', objectKey);
form.append('file', file);

await axios.post(uploadHost, form, {
  headers: { 'Content-Type': 'multipart/form-data' }, // axios 会补全 boundary；若报错可改为不手动设置，让 axios 自动处理
});
```

若遇 boundary 问题，优先使用「不手写 Content-Type」或 axios 文档推荐写法。

---

## 5. 成功与失败时如何排查

### 5.1 成功（HTTP 200）

响应体为 JSON 字符串，常见字段：`hash`、`key`。可拼访问域名：  
`https://<你的绑定域名>/<key>`（具体以控制台绑定的 CDN/源站域名为准）。

### 5.2 HTTP 400（重点）

官方含义：**请求报文格式错误**。请按序自查：

1. **上传 URL 是否与 Bucket 区域一致**（最常见：`incorrect region`）。
2. 是否用了 **multipart/form-data**，且字段名是否为 **`file`**、**`token`**（拼写错误会直接 400）。
3. `file` 是否真的是文件流部件（不是纯字符串字段）。
4. 是否错误地把文件放进 JSON body，或 `Content-Type` 被设成 `application/json`。
5. 自行拼接 multipart 时：boundary 是否规范、是否多/少了 `\r\n`（**优先用库生成 FormData，不要手写 raw body**）。

### 5.3 HTTP 401 / 403

- **401**：token 无效、过期、格式错。
- **403**：无权限、或 `key` 与 `scope` 不匹配等。

---

## 6. 图片场景建议

- **对象名 `key`**：带路径前缀 + 随机名 + **正确扩展名**，如 `img/2025/03/${uuid}.jpg`，便于 CDN 缓存与类型识别。
- **MIME**：表单里的文件部件 Content-Type 一般随文件类型即可；若需在下载时强制 `Content-Type`，可在 PutPolicy 或后续数据处理里配置（进阶，非上传必填）。
- **大图**：直传逻辑与普通文件相同；断点续传、分片上传属于另一套 API，不在本文「表单直传」范围。

---

## 7. 用 curl 自测（便于与 AI 实现对照）

把 `<TOKEN>`、`<KEY>`、`<本地文件路径>`、`<上传域名>` 换成真实值：

```bash
curl -v -X POST "https://upload.qiniup.com/" \
  -F "token=<TOKEN>" \
  -F "key=<KEY>" \
  -F "file=@/path/to/local.jpg;type=image/jpeg"
```

若 curl 成功而程序失败，对比程序是否少了字段、URL 区域是否一致、是否被代理改写 body。

---

## 8. 交付给实现方（MiniMax）的检查清单

- [ ] 上传域名与控制台 Bucket **区域**一致  
- [ ] 请求为 **POST multipart**，含 **`file`** + **`token`**  
- [ ] `key` 与 PutPolicy **`scope`** 不冲突  
- [ ] `deadline` 为**秒级**时间戳且未过期  
- [ ] SecretKey 只留在服务端，客户端仅持有 **uploadToken**  
- [ ] 失败时打印 **HTTP 状态码 + 响应 body 全文**（七牛会在 body 里给出具体错误码与说明）

---

## 参考（人工查阅）

- 表单上传：<https://developer.qiniu.com/kodo/manual/1272/form-upload>  
- 上传失败常见状态码：<https://developer.qiniu.com/kodo/kb/3881/upload-the-common-failure-status-code-and-solve-method>

（若官方文档与控制台选项有更新，以控制台当前区域与官方最新文档为准。）

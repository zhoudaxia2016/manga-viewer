/**
 * 删除 KV 中所有限流计数（key 前缀 `rate`：匿名按 IP 按日、登录尝试按小时等）。
 * 与漫画数据在同一 KV（见 DB_PATH）；重启服务不会清空这些键。
 *
 * 用法：
 *   cd server && deno task clear-rate
 *   deno run --allow-read --allow-write --unstable-kv --allow-env scripts/clear_rate_limits.ts [kv路径]
 *
 * 打开哪个库：命令行路径 > 环境变量 DB_PATH（可 dotenv）> Deno.openKv() 默认路径（与未设 DB_PATH 的 main 一致）。
 * 建议先停掉 API 再执行，避免与正在进行的限流原子更新冲突。
 */
import 'dotenv/load.ts';

const argPath = Deno.args[0]?.trim();
const envPath = Deno.env.get('DB_PATH')?.trim();

const kv = argPath
  ? await Deno.openKv(argPath)
  : envPath
  ? await Deno.openKv(envPath)
  : await Deno.openKv();

const label = argPath ?? envPath ?? '(default Deno.openKv())';
console.log('KV:', label);

const keys: Deno.KvKey[] = [];
for await (const entry of kv.list({ prefix: ['rate'] })) {
  keys.push(entry.key);
}

for (const key of keys) {
  await kv.delete(key);
  console.log('deleted', JSON.stringify(key));
}

console.log(`Done. Removed ${keys.length} key(s).`);
kv.close();

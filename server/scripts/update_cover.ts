import "dotenv/load.ts";
import { getKv } from "../lib/kv.ts";
import { getR2S3Client } from "../lib/r2-s3-client.ts";
import { md5 } from "../lib/md5.ts";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_BASE = Deno.env.get("R2_PUBLIC_BASE") || "";
const DB_PATH = Deno.env.get("DB_PATH") ?? "./manga.db";

const MANGA_NAME = "還暦姫";
const COVER_PATH = `../data/${MANGA_NAME}/cover.jpg`;

function getR2Endpoint(): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

async function uploadToR2(fileData: Uint8Array, key: string, fileName: string): Promise<string> {
  const client = getR2S3Client(
    getR2Endpoint(),
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  );
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fileData,
    ContentType: "image/jpeg",
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}

async function main() {
  console.log(`更新 ${MANGA_NAME} 的封面...`);
  console.log(`读取本地文件: ${COVER_PATH}`);

  const fileData = await Deno.readFile(COVER_PATH);
  console.log(`文件大小: ${fileData.length} bytes`);

  const kv = await Deno.openKv(DB_PATH);
  const key = `manga/${MANGA_NAME}/cover.jpg`;

  const hash = await md5(fileData);
  console.log(`MD5: ${hash}`);

  const md5Entry = await kv.get(["md5", hash]);
  if (md5Entry.value) {
    const existingUrl = (md5Entry.value as { url: string; key: string }).url;
    console.log(`MD5 命中，使用已有 URL: ${existingUrl}`);
    await kv.set(["manga", MANGA_NAME, "cover"], { url: existingUrl });
    console.log("✅ KV 已更新");
    return;
  }

  console.log(`上传到 R2: ${key}`);
  const url = await uploadToR2(fileData, key, "cover.jpg");
  console.log(`R2 URL: ${url}`);

  await kv.set(["md5", hash], { url, key });
  await kv.set(["manga", MANGA_NAME, "cover"], { url });

  console.log("✅ 封面已更新!");
  console.log(`   R2 Key: ${key}`);
  console.log(`   URL: ${url}`);
}

main();

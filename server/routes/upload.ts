import { json } from '../lib/cors.ts';
import { getKv } from '../lib/kv.ts';
import { md5 } from '../lib/md5.ts';
import { getR2S3Client } from '../lib/r2-s3-client.ts';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') || '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') || '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
const R2_BUCKET = Deno.env.get('R2_BUCKET') || '';
const R2_PUBLIC_BASE = Deno.env.get('R2_PUBLIC_BASE') || '';

function getR2Endpoint(): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const types: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return types[ext || ''] || 'application/octet-stream';
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
    ContentType: getContentType(fileName),
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}

export async function handleUpload(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE) {
    return json({
      error: 'R2 not configured',
      message: 'Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE environment variables'
    }, 500);
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mangaName = formData.get('mangaName') as string | null;
    const chapterName = formData.get('chapterName') as string | null;
    const mangaRootCover = formData.get('mangaRootCover') === '1';

    if (!file) return json({ error: 'No file provided' }, 400);
    if (!mangaName) {
      return json({ error: 'Missing mangaName' }, 400);
    }

    const kv = await getKv();

    /** 漫画根目录 `漫画名/cover.jpg`（与章节文件夹同级），单独存 KV，不进章节列表 */
    if (mangaRootCover) {
      const coverFileName = 'cover.jpg';
      const key = `manga/${mangaName}/${coverFileName}`;

      const fileData = new Uint8Array(await file.arrayBuffer());
      const hash = await md5(fileData);

      let url: string;
      const md5Entry = await kv.get(['md5', hash]);

      if (md5Entry.value) {
        url = `${R2_PUBLIC_BASE}/${(md5Entry.value as { url: string; key: string }).key}`;
      } else {
        url = await uploadToR2(fileData, key, coverFileName);
        await kv.set(['md5', hash], { url, key });
      }

      await kv.set(['manga', mangaName, 'cover'], { url });

      const mangaEntry = await kv.get(['manga', mangaName]);
      if (!mangaEntry.value) {
        await kv.set(['manga', mangaName], { name: mangaName, created_at: new Date().toISOString() });
      }
      return json({ success: true, url, key, name: coverFileName, skipped: false, mangaRootCover: true });
    }

    if (!chapterName) {
      return json({ error: 'Missing chapterName' }, 400);
    }

    const key = `manga/${mangaName}/${chapterName}/${file.name}`;

    const chapterKey = ['manga', mangaName, 'chapters', chapterName];
    const chapter = await kv.get(chapterKey);

    let chapterData = chapter.value as { name: string; images: { name: string; url: string }[]; created_at: string } | null;
    let images = chapterData?.images || [];

    // Case 1: DB already has this image in this chapter → early return
    const existingImage = images.find(img => img.name === file.name);
    if (existingImage) {
      return json({ success: true, url: existingImage.url, key, name: file.name, skipped: true });
    }

    const fileData = new Uint8Array(await file.arrayBuffer());
    const hash = await md5(fileData);

    let url: string;
    const md5Entry = await kv.get(['md5', hash]);

    if (md5Entry.value) {
      url = `${R2_PUBLIC_BASE}/${(md5Entry.value as { url: string; key: string }).key}`;
    } else {
      url = await uploadToR2(fileData, key, file.name);
      await kv.set(['md5', hash], { url, key });
    }

    images.push({ name: file.name, url });
    await kv.set(chapterKey, {
      name: chapterName,
      images,
      created_at: chapterData?.created_at || new Date().toISOString(),
    });

    const mangaEntry = await kv.get(['manga', mangaName]);
    if (!mangaEntry.value) {
      await kv.set(['manga', mangaName], { name: mangaName, created_at: new Date().toISOString() });
    }
    return json({ success: true, url, key, name: file.name, skipped: false });

  } catch (err) {
    console.error('Upload error:', err);
    return json({ error: 'Upload failed', message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

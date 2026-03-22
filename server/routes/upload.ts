import { json } from '../lib/cors.ts';
import { getKv } from '../lib/kv.ts';
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

    if (!file) return json({ error: 'No file provided' }, 400);
    if (!mangaName || !chapterName) {
      return json({ error: 'Missing mangaName or chapterName' }, 400);
    }

    const key = `manga/${mangaName}/${chapterName}/${file.name}`;

    const kv = await getKv();
    const chapterKey = ['manga', mangaName, 'chapters', chapterName];
    const chapter = await kv.get(chapterKey);
    
    let chapterData = chapter.value as { name: string; images: { name: string; url: string }[]; created_at: string } | null;
    let images = chapterData?.images || [];
    
    const existingImage = images.find(img => img.name === file.name);
    let url: string;
    
    if (existingImage) {
      url = existingImage.url;
    } else {
      const fileData = await file.arrayBuffer();
      url = await uploadToR2(new Uint8Array(fileData), key, file.name);
      images.push({ name: file.name, url });
    }
    
    await kv.set(chapterKey, {
      name: chapterName,
      images,
      created_at: new Date().toISOString()
    });

    const mangaEntry = await kv.get(['manga', mangaName]);
    if (!mangaEntry.value) {
      await kv.set(['manga', mangaName], { name: mangaName, created_at: new Date().toISOString() });
    }
    return json({ success: true, url, key, name: file.name, skipped: !!existingImage });

  } catch (err) {
    console.error('Upload error:', err);
    return json({ error: 'Upload failed', message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

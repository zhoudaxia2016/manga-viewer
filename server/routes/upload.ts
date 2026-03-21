import { json } from '../lib/cors.ts';
import Qiniu from 'qiniu';

const QINIU_ACCESS_KEY = Deno.env.get('QINIU_ACCESS_KEY') || '';
const QINIU_SECRET_KEY = Deno.env.get('QINIU_SECRET_KEY') || '';
const QINIU_BUCKET = Deno.env.get('QINIU_BUCKET') || '';
const QINIU_DOMAIN = Deno.env.get('QINIU_DOMAIN') || '';
const DB_PATH = Deno.env.get('DB_PATH') || './manga.db';
const UPLOAD_HOST = 'https://upload-z2.qiniup.com';

async function getDb() {
  return await Deno.openKv(DB_PATH.replace('./', './'));
}

function generateUploadToken(key: string): string {
  const mac = new Qiniu.auth.digest.Mac(QINIU_ACCESS_KEY, QINIU_SECRET_KEY);
  const options = {
    scope: QINIU_BUCKET,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  };
  const putPolicy = new Qiniu.rs.PutPolicy(options);
  return putPolicy.uploadToken(mac);
}

async function uploadToQiniu(fileData: Uint8Array, key: string): Promise<string> {
  const token = generateUploadToken(key);

  const formData = new FormData();
  formData.append('file', new Blob([fileData]), key);
  formData.append('token', token);
  formData.append('key', key);

  const res = await fetch(UPLOAD_HOST, {
    method: 'POST',
    body: formData,
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Qiniu upload failed: ${res.status}, body: ${bodyText}`);
  }

  return `http://${QINIU_DOMAIN}/${key}`;
}

export async function handleUpload(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!QINIU_ACCESS_KEY || !QINIU_SECRET_KEY || !QINIU_BUCKET) {
    return json({
      error: 'Qiniu not configured',
      message: 'Please set QINIU_ACCESS_KEY, QINIU_SECRET_KEY, QINIU_BUCKET environment variables'
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

    const key = `${mangaName}/${chapterName}/${file.name}`;

    const kv = await getDb();
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
      url = await uploadToQiniu(new Uint8Array(fileData), key);
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
    await kv.close();

    return json({ success: true, url, key, name: file.name, skipped: !!existingImage });

  } catch (err) {
    console.error('Upload error:', err);
    return json({ error: 'Upload failed', message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

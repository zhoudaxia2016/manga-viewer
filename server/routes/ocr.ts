import { corsHeaders } from '../lib/cors.ts';

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const API_KEY = Deno.env.get('OCR_SPACE_API_KEY') ?? '';

export async function handleOcr(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let blob: Blob;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return new Response('No file provided', { status: 400 });
    }
    blob = file;
  } catch {
    return new Response('Invalid request', { status: 400 });
  }

  const forwarded = new FormData();
  forwarded.append('file', blob, 'image.png');
  forwarded.append('language', 'jpn');
  forwarded.append('scale', 'true');
  forwarded.append('detectOrientation', 'true');
  forwarded.append('OCREngine', '1');

  const ocrRes = await fetch(OCR_API_URL, {
    method: 'POST',
    headers: { apikey: API_KEY },
    body: forwarded,
    signal: AbortSignal.timeout(120_000),
  });

  const data = await ocrRes.json();
  if (Deno.env.get('OCR_DEBUG') === '1') {
    console.debug('[OCR] ocr.space response:', JSON.stringify(data, null, 2));
  }
  return Response.json(data, { headers: corsHeaders });
}

import 'dotenv/load.ts';
import { assertEquals } from 'jsr:@std/assert@1';
import { handleUpload } from '../routes/upload.ts';

function makeUploadRequest(fileName: string): Request {
  const fd = new FormData();
  fd.append('mangaName', '__seq_test__');
  fd.append('chapterName', 'c1');
  fd.append(
    'file',
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], fileName, {
      type: 'image/jpeg',
    }),
  );
  return new Request('http://test/api/upload', { method: 'POST', body: fd });
}

Deno.test({
  name: 'sequential uploads',
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  if (!Deno.env.get('R2_BUCKET')) {
    console.log('[upload_seq_test] SKIP: R2_BUCKET not set');
    return;
  }

  const r1 = await handleUpload(makeUploadRequest('seq-a.jpg'));
  const t1 = await r1.text();
  assertEquals(r1.status, 200, `first upload: ${t1}`);

  const r2 = await handleUpload(makeUploadRequest('seq-b.jpg'));
  const t2 = await r2.text();
  assertEquals(r2.status, 200, `second upload: ${t2}`);
});

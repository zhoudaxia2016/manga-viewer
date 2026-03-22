import { FetchHttpHandler } from 'npm:@smithy/fetch-http-handler';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

let r2Http: Deno.HttpClient | null = null;
function getR2Http(): Deno.HttpClient {
  if (!r2Http) {
    r2Http = Deno.createHttpClient({ poolMaxIdlePerHost: 0 });
  }
  return r2Http;
}

let client: S3Client | null = null;

export function getR2S3Client(
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      maxAttempts: 5,
      requestHandler: new FetchHttpHandler({
        requestInit: () => ({
          client: getR2Http(),
        }),
      }),
    });
  }
  return client;
}

export async function checkR2Exists(
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
): Promise<boolean> {
  const client = getR2S3Client(endpoint, accessKeyId, secretAccessKey);
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'NotFound') {
      return false;
    }
    throw err;
  }
}

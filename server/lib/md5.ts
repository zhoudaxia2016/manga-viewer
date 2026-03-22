import { crypto } from 'jsr:@std/crypto';
import { encodeHex } from 'jsr:@std/encoding/hex';

export async function md5(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('MD5', data);
  return encodeHex(new Uint8Array(hash));
}

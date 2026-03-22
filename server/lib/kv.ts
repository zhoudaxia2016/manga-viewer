let kvPromise: Promise<Deno.Kv> | null = null;

export function getKv(): Promise<Deno.Kv> {
  if (!kvPromise) {
    const dbPath = Deno.env.get('DB_PATH');
    kvPromise = dbPath ? Deno.openKv(dbPath) : Deno.openKv();
  }
  return kvPromise;
}

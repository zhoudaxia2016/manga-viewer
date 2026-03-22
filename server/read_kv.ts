const dbPath = Deno.args[0] || "./manga.db";
console.log("Opening:", dbPath);

const kv = await Deno.openKv(dbPath);
const iter = kv.list({ prefix: [] });

let count = 0;
for await (const entry of iter) {
  count++;
  console.log(`\n=== Entry ${count} ===`);
  console.log("KEY:", JSON.stringify(entry.key));
  console.log("VALUE:", JSON.stringify(entry.value));
  console.log("VERSION:", entry.versionstamp);
}

console.log(`\nTotal: ${count} entries`);
kv.close();

import "dotenv/load.ts";

const dbPath = Deno.env.get("DB_PATH") ?? "../manga.db";

async function main() {
  const kv = await Deno.openKv(dbPath);

  const mangaList: string[] = [];
  const mangaIter = kv.list({ prefix: ["manga"] });
  for await (const entry of mangaIter) {
    if (entry.key.length === 2 && entry.key[0] === "manga") {
      mangaList.push(entry.key[1] as string);
    }
  }

  console.log(`找到 ${mangaList.length} 部漫画`);

  for (const mangaName of mangaList) {
    const chapterIter = kv.list({ prefix: ["manga", mangaName, "chapters"] });
    const chapters: { key: Deno.KvKey; value: { name: string; images: { name: string; url: string }[] } }[] = [];

    for await (const entry of chapterIter) {
      if (entry.key.length === 4 && entry.key[2] === "chapters") {
        chapters.push({ key: entry.key, value: entry.value as { name: string; images: { name: string; url: string }[] } });
      }
    }

    chapters.sort((a, b) => {
      const aId = a.key[3] as string;
      const bId = b.key[3] as string;
      return aId.localeCompare(bId, undefined, { numeric: true });
    });

    console.log(`\n${mangaName}: ${chapters.length} 个章节`);

    for (let i = 0; i < chapters.length; i++) {
      const oldKey = chapters[i].key;
      const chapterId = oldKey[3] as string;
      const newName = `第${i + 1}话`;

      console.log(`  ${chapterId} → ${newName}`);

      const oldData = chapters[i].value;

      await kv.delete(oldKey);

      const newKey: Deno.KvKey = ["manga", mangaName, "chapters", newName];
      await kv.set(newKey, oldData);
    }
  }

  console.log("\n✅ 完成！");
}

main();

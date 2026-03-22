import "dotenv/load.ts";

const dbPath = Deno.env.get("DB_PATH") ?? "./manga.db";

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

    if (chapters.length === 0) continue;

    console.log(`\n${mangaName}: ${chapters.length} 个章节`);

    for (const chapter of chapters) {
      const chapterId = chapter.key[3] as string;
      const oldName = chapter.value.name;

      if (oldName !== chapterId) {
        console.log(`  ${chapterId}: "${oldName}" → "${chapterId}"`);
        chapter.value.name = chapterId;
        await kv.set(chapter.key, chapter.value);
      } else {
        console.log(`  ${chapterId}: already synced`);
      }
    }
  }

  console.log("\n✅ 完成！");
}

main();

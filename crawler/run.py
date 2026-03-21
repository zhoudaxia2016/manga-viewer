import argparse
import asyncio
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from crawlers import CrawlerRegistry
from utils.downloader import Downloader, DownloadResult


def progress_bar(current: int, total: int, width: int = 30) -> str:
    filled = int(width * current / total) if total > 0 else 0
    bar = "█" * filled + "░" * (width - filled)
    pct = f"{100 * current / total:.1f}%" if total > 0 else "0%"
    return f"[{bar}] {pct} ({current}/{total})"


async def crawl_chapter(
    crawler,
    chapter_url: str,
    save_dir: str,
    chapter_id: str,
    chapter_num: int = 0,
    total_chapters: int = 0,
):
    downloader = Downloader(concurrency=8, max_retries=3)

    print(f"  获取章节图片: {chapter_url}", end="", flush=True)
    images = await crawler.get_chapter_images(chapter_url)
    print(f" ✓ ({len(images)}张)")

    if not images:
        print("  无图片")
        return 0, 0

    save_path = crawler.chapter_to_folder(save_dir, chapter_id)
    print(f"  下载到: {save_path}")

    total = len(images)
    completed = 0
    success = 0

    async def download_with_progress(i: int, url: str) -> DownloadResult:
        nonlocal completed, success
        ext = downloader._get_ext(url)
        filename = f"p{i:03d}{ext}"
        path = str(Path(save_path) / filename)
        result = await downloader.download(url, path)
        completed += 1
        if result.success:
            success += 1
        bar = progress_bar(completed, total)
        status = "✓" if result.success else "✗"
        if result.retries > 0:
            status += f"(重试{result.retries})"
        print(f"  {status} {bar}", end="\r", flush=True)
        return result

    tasks = [download_with_progress(i, url) for i, url in enumerate(images, 1)]
    await asyncio.gather(*tasks)

    print()
    failed = total - success
    if failed > 0:
        print(f"  失败: {failed}张")

    return success, total


def extract_manga_homepage(url: str) -> str:
    match = re.match(r"(.+)/di\d+hua?", url.rstrip("/"))
    if match:
        return match.group(1)
    match = re.match(r"(.+)/chapter-\d+", url.rstrip("/"))
    if match:
        return match.group(1)
    return url


async def crawl_manga(
    crawler, url: str, save_dir: str, chapters: list = None, delay=(1, 2)
):
    manga_url = extract_manga_homepage(url)
    if manga_url != url:
        print(f"检测到章节URL，自动转换为漫画首页: {manga_url}")

    print(f"获取漫画信息: {manga_url}")
    await asyncio.sleep(random.uniform(*delay))
    manga = await crawler.get_manga_info(manga_url)
    print(f"漫画名: {manga.name}")
    print(f"章节数: {len(manga.chapters)}")

    if chapters:
        targets = [c for c in manga.chapters if c.id in chapters or c.title in chapters]
        if not targets:
            print(f"未找到指定章节: {chapters}, 爬取第1话")
            targets = list(manga.chapters[:1])
    else:
        chapter_id = url.rstrip("/").split("/")[-1]
        targets = [c for c in manga.chapters if c.id == chapter_id]
        if not targets:
            targets = list(manga.chapters[:1])

    print(f"\n将爬取 {len(targets)} 个章节\n")

    total_success = 0
    total_count = 0

    for i, chapter in enumerate(targets, 1):
        bar = progress_bar(i, len(targets))
        print(f"\n[{i}/{len(targets)}] {chapter.title} {bar}")
        s, c = await crawl_chapter(
            crawler, chapter.url, manga.name, chapter.id, i, len(targets)
        )
        total_success += s
        total_count += c

        total_bar = progress_bar(total_success, total_count)
        print(f"  总进度: {total_bar}")

        if i < len(targets):
            wait = random.uniform(*delay)
            print(f"  等待 {wait:.1f}s...")
            await asyncio.sleep(wait)

    print(f"\n{'=' * 50}")
    print(f"完成: {manga.name}")
    print(f"总计: {total_success}/{total_count} 张图片")
    if total_count > 0 and total_success < total_count:
        print(f"失败: {total_count - total_success}张")
    return manga.name, total_success, total_count


async def main():
    parser = argparse.ArgumentParser(description="漫画爬虫")
    parser.add_argument("url", help="漫画章节URL或漫画首页URL")
    parser.add_argument("-c", "--chapters", nargs="+", help="指定章节ID或标题")
    parser.add_argument("-s", "--save-dir", default="../data", help="保存目录")
    parser.add_argument("-n", "--name", help="漫画保存文件夹名称")
    parser.add_argument("--crawler", default="raw1001", help="爬虫名称")
    parser.add_argument("--list-crawlers", action="store_true", help="列出支持的网站")
    parser.add_argument(
        "--delay",
        type=float,
        nargs=2,
        default=[1, 2],
        metavar=("MIN", "MAX"),
        help="请求间隔范围(秒) 默认 1 2",
    )

    args = parser.parse_args()

    if args.list_crawlers:
        print("支持的网站:")
        for name, domain in CrawlerRegistry.list().items():
            print(f"  {name}: {domain}")
        return

    crawler_cls = CrawlerRegistry.get(args.crawler)
    crawler = crawler_cls(save_dir=args.save_dir)

    try:
        name, success, total = await crawl_manga(
            crawler,
            args.url,
            args.name or args.save_dir,
            args.chapters,
            delay=tuple(args.delay),
        )
    finally:
        await crawler.close()


if __name__ == "__main__":
    print("=" * 50)
    print("漫画爬虫")
    print("=" * 50)
    asyncio.run(main())

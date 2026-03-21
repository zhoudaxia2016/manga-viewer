import asyncio
from typing import List
from urllib.parse import urljoin

from playwright.async_api import async_playwright

from .base import BaseCrawler, Manga, Chapter
from .registry import register_crawler


@register_crawler
class Raw1001Crawler(BaseCrawler):
    name = "raw1001"
    domain = "raw1001.net"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.playwright = None
        self.browser = None
        self.context = None

    async def _ensure_browser(self):
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            self.context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
        return self.browser

    async def _close(self):
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

    async def get_manga_info(self, url: str) -> Manga:
        await self._ensure_browser()
        page = await self.context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            title_elem = await page.query_selector("h1, .chapter-title")
            title = await title_elem.inner_text() if title_elem else "unknown"

            chapters = []
            chapter_links = await page.query_selector_all("a[href*='/manga/']")

            for link in chapter_links:
                href = await link.get_attribute("href")
                text = await link.inner_text()

                if href and "/di" in href and "hua" in href:
                    chapters.append(
                        Chapter(
                            id=self._extract_chapter_id(href),
                            title=text.strip(),
                            url=urljoin("https://raw1001.net", href),
                        )
                    )

            seen = set()
            unique_chapters = []
            for ch in reversed(chapters):
                if ch.id not in seen:
                    seen.add(ch.id)
                    unique_chapters.append(ch)

            return Manga(name=title.strip(), chapters=unique_chapters)

        finally:
            await page.close()

    def _extract_chapter_id(self, url: str) -> str:
        parts = url.rstrip("/").split("/")
        return parts[-1] if parts else "unknown"

    async def get_chapter_images(self, chapter_url: str) -> List[str]:
        await self._ensure_browser()
        page = await self.context.new_page()

        try:
            await page.goto(chapter_url, wait_until="domcontentloaded", timeout=30000)

            # 滚动页面触发懒加载
            for _ in range(5):
                await page.evaluate("window.scrollBy(0, 500)")
                await page.wait_for_timeout(500)

            images = []
            img_elements = await page.query_selector_all("img")

            for img in img_elements:
                src = await img.get_attribute("src")
                if src and self._is_valid_image(src):
                    images.append(src)

            return images

        finally:
            await page.close()

    def _is_valid_image(self, url: str) -> bool:
        invalid_patterns = ["loading.gif", "logo.png", "avatar", "emoji"]
        return (
            url.startswith("http")
            and not any(p in url for p in invalid_patterns)
            and any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"])
        )

    async def close(self):
        await self._close()

from typing import List
from urllib.parse import urljoin
from .base import BaseCrawler, Manga, Chapter
from .registry import register_crawler


@register_crawler
class TemplateCrawler(BaseCrawler):
    """新爬虫模板 - 复制此文件创建新的爬虫"""

    name = "template"
    domain = "example.com"

    async def get_manga_info(self, url: str) -> Manga:
        """获取漫画信息"""
        browser = await self._ensure_browser()
        page = await self.context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)

            title_elem = await page.query_selector("h1, .title, .manga-title")
            title = await title_elem.inner_text() if title_elem else "unknown"

            chapters = []
            chapter_links = await page.query_selector_all(
                "a[href*='/chapter/'], a[href*='/ch/']"
            )

            for link in chapter_links:
                href = await link.get_attribute("href")
                text = await link.inner_text()
                if href:
                    chapters.append(
                        Chapter(
                            id=self._extract_chapter_id(href),
                            title=text.strip(),
                            url=urljoin("https://" + self.domain, href),
                        )
                    )

            return Manga(name=title.strip(), chapters=chapters)

        finally:
            await page.close()

    def _extract_chapter_id(self, url: str) -> str:
        parts = url.rstrip("/").split("/")
        return parts[-1] if parts else "unknown"

    async def get_chapter_images(self, chapter_url: str) -> List[str]:
        """获取章节所有图片URL"""
        browser = await self._ensure_browser()
        page = await self.context.new_page()

        try:
            await page.goto(chapter_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)

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
        invalid = ["loading", "logo", "avatar", "icon", "emoji", "placeholder"]
        return (
            url.startswith("http")
            and not any(p in url.lower() for p in invalid)
            and any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"])
        )

    async def _ensure_browser(self):
        if self.browser is None:
            from playwright.async_api import async_playwright

            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            self.context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
        return self.browser

    async def close(self):
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

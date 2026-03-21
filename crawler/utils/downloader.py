import asyncio
import httpx
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class DownloadResult:
    url: str
    path: str
    success: bool
    error: Optional[str] = None
    retries: int = 0


class Downloader:
    def __init__(self, concurrency: int = 3, timeout: int = 60, max_retries: int = 3):
        self.concurrency = concurrency
        self.timeout = timeout
        self.max_retries = max_retries
        self.semaphore = asyncio.Semaphore(concurrency)

    async def download(self, url: str, path: str, retries: int = 0) -> DownloadResult:
        Path(path).parent.mkdir(parents=True, exist_ok=True)

        async with self.semaphore:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        with open(path, "wb") as f:
                            f.write(resp.content)
                        return DownloadResult(
                            url=url, path=path, success=True, retries=retries
                        )
                    elif resp.status_code in (403, 404, 410):
                        return DownloadResult(
                            url=url,
                            path=path,
                            success=False,
                            error=f"HTTP {resp.status_code}",
                            retries=retries,
                        )
                    else:
                        if retries < self.max_retries:
                            await asyncio.sleep(1 * (retries + 1))
                            return await self.download(url, path, retries + 1)
                        return DownloadResult(
                            url=url,
                            path=path,
                            success=False,
                            error=f"HTTP {resp.status_code}",
                            retries=retries,
                        )
            except Exception as e:
                if retries < self.max_retries:
                    await asyncio.sleep(1 * (retries + 1))
                    return await self.download(url, path, retries + 1)
                return DownloadResult(
                    url=url, path=path, success=False, error=str(e), retries=retries
                )

    async def download_batch(
        self, urls: List[str], base_path: str, prefix: str = ""
    ) -> List[DownloadResult]:
        tasks = []
        for i, url in enumerate(urls):
            ext = self._get_ext(url)
            filename = f"{prefix}{i + 1:03d}{ext}" if prefix else f"{i + 1:03d}{ext}"
            path = str(Path(base_path) / filename)
            tasks.append(self.download(url, path))

        return await asyncio.gather(*tasks)

    def _get_ext(self, url: str) -> str:
        for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            if ext in url.lower():
                return ".jpg" if ext in [".jpeg", ".jpg"] else ext
        return ".jpg"

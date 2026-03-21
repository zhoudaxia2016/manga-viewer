from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Chapter:
    id: str
    title: str
    url: str


@dataclass
class Manga:
    name: str
    author: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    chapters: List[Chapter] = field(default_factory=list)


class BaseCrawler(ABC):
    name: str = "base"
    domain: str = ""

    def __init__(self, save_dir: str = "./data"):
        self.save_dir = save_dir

    @abstractmethod
    async def get_manga_info(self, url: str) -> Manga:
        """获取漫画信息（名称、章节列表等）"""
        pass

    @abstractmethod
    async def get_chapter_images(self, chapter_url: str) -> List[str]:
        """获取章节所有图片URL"""
        pass

    async def download_image(self, url: str, path: str) -> bool:
        """下载单张图片"""
        import httpx
        import os

        os.makedirs(os.path.dirname(path), exist_ok=True)

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    with open(path, "wb") as f:
                        f.write(resp.content)
                    return True
            except Exception as e:
                print(f"下载失败 {url}: {e}")
        return False

    def chapter_to_folder(self, manga_name: str, chapter_id: str) -> str:
        import os

        safe_name = "".join(c for c in manga_name if c not in r'\/:*?"<>|')
        safe_chapter = "".join(c for c in chapter_id if c not in r'\/:*?"<>|')
        return os.path.join(self.save_dir, safe_name, safe_chapter)

    async def close(self):
        pass

from typing import Dict, Type
from .base import BaseCrawler


class CrawlerRegistry:
    _crawlers: Dict[str, Type[BaseCrawler]] = {}

    @classmethod
    def register(cls, crawler: Type[BaseCrawler]):
        cls._crawlers[crawler.name] = crawler

    @classmethod
    def get(cls, name: str) -> Type[BaseCrawler]:
        if name not in cls._crawlers:
            raise ValueError(f"Unknown crawler: {name}")
        return cls._crawlers[name]

    @classmethod
    def list(cls) -> Dict[str, str]:
        return {name: crawler.domain for name, crawler in cls._crawlers.items()}


def register_crawler(cls: Type[BaseCrawler]):
    CrawlerRegistry.register(cls)
    return cls

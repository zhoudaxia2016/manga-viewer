"""配置"""

import os

# 数据存储目录
DATA_DIR = os.environ.get("MANGA_DATA_DIR", "./data")

# Playwright 配置
PLAYWRIGHT_HEADLESS = True
PLAYWRIGHT_TIMEOUT = 30000  # 30秒

# 下载配置
DOWNLOAD_CONCURRENCY = 3  # 并发下载数
DOWNLOAD_TIMEOUT = 60  # 下载超时(秒)

# 爬虫配置
SUPPORTED_DOMAINS = ["raw1001.net"]

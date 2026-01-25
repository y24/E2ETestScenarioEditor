"""
AlertSamplePage - TAG indexアラートサンプルページ

https://www.tagindex.com/javascript/window/alert1.html のページオブジェクト
"""
from src.pages.base_web_page import BaseWebPage


class AlertSamplePage(BaseWebPage):
    """TAG indexのアラートダイアログサンプルページ"""
    
    # ページURL
    URL = "https://www.tagindex.com/javascript/window/alert1.html"
    
    # 要素定義（ロケータータイプ, 値）
    alert_button = ("xpath", "//*[@id='content']/section[1]/figure/p/input")

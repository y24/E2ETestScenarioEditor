from pywinauto import Application, WindowSpecification
from typing import Optional
from src.utils.driver_factory import DriverFactory

class BasePage:
    def __init__(self, title_re: str = None, auto_id: str = None):
        """
        Initialize BasePage with a window searching criteria.
        """
        self.app = DriverFactory.get_app()
        self.title_re = title_re
        self.auto_id = auto_id
        
    @property
    def window(self) -> WindowSpecification:
        """Returns the main window of the page."""
        kwargs = {}
        if self.title_re:
            kwargs['title_re'] = self.title_re
        if self.auto_id:
            kwargs['auto_id'] = self.auto_id
            
        return self.app.window(**kwargs)

    def wait_for_exists(self, timeout=10):
        self.window.wait('exists', timeout=timeout)

    def exists(self) -> bool:
        return self.window.exists()

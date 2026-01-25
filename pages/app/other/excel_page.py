#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel page object without external helper.
Responsible for starting/activating Excel, sending key-based operations,
and cleaning up transient state.
"""

import glob
import logging
import os
import time
from typing import List, Optional

from pywinauto.keyboard import send_keys

from src.utils.driver_factory import DriverFactory
from src.utils.excel_automation_configs import ExcelConfig

logger = logging.getLogger(__name__)


class ExcelPage:
    """Excel page object that owns Excel lifecycle and key operations."""

    copied_files: List[str] = []

    def __init__(self):
        self._app = None
        self._window = None
        # Shared list reference for copied files
        self.copied_files = self.__class__.copied_files

    # ----- internal handle helpers -----
    @property
    def app(self):
        if self._app is None and DriverFactory.is_excel_running():
            try:
                self._app = DriverFactory.get_excel_app()
            except Exception:
                logger.debug("Failed to refresh Excel app handle", exc_info=True)
        return self._app

    @property
    def window(self):
        if self._window is None and DriverFactory.is_excel_running():
            try:
                self._window = DriverFactory.get_excel_window()
            except Exception:
                logger.debug("Failed to refresh Excel window handle", exc_info=True)
        return self._window

    def _refresh_handles(self):
        if DriverFactory.is_excel_running():
            try:
                self._app = DriverFactory.get_excel_app()
                self._window = DriverFactory.get_excel_window()
            except Exception:
                logger.debug("Failed to refresh Excel handles", exc_info=True)

    # ----- lifecycle operations -----
    def start(self, file_path: Optional[str] = None) -> bool:
        try:
            self._cleanup_recovery_files()
            DriverFactory.start_excel(file_path)
            self._refresh_handles()
            logger.info("Excel started")
            return True
        except Exception as e:
            logger.error(f"Failed to start Excel: {e}", exc_info=True)
            return False

    def activate_window(self, max_retries: int = 3, retry_delay: float = 1.0) -> bool:
        if not self.app or not self.window:
            logger.warning("Excel app/window not initialized")
            return False

        for attempt in range(max_retries):
            try:
                try:
                    self.window.set_focus()
                    time.sleep(ExcelConfig.get_timing('window_activation'))
                    return True
                except Exception:
                    logger.debug("set_focus failed; trying win32 fallback", exc_info=True)

                try:
                    import win32con
                    import win32gui

                    hwnd = self.window.handle
                    if hwnd:
                        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                        time.sleep(ExcelConfig.get_timing('window_activation'))
                        win32gui.SetForegroundWindow(hwnd)
                        time.sleep(ExcelConfig.get_timing('window_activation'))
                        return True
                except Exception:
                    logger.debug("win32 fallback failed", exc_info=True)

            except Exception:
                logger.debug(f"Window activation attempt {attempt + 1} failed", exc_info=True)

            if attempt < max_retries - 1:
                time.sleep(retry_delay)

        logger.warning("Excel window activation failed after retries")
        return False

    def _ensure_active(self, operation_name: str = "operation") -> bool:
        logger.debug(f"Activating Excel window before {operation_name}")
        activated = self.activate_window(
            max_retries=ExcelConfig.ERROR_HANDLING.get('max_retries', 3),
            retry_delay=ExcelConfig.ERROR_HANDLING.get('retry_delay', 1.0),
        )
        if not activated:
            logger.warning(f"Excel window not active before {operation_name}")
        return activated

    def exists(self) -> bool:
        return self.window is not None

    # ----- user operations -----
    def select_cell(self, row: int = None, column: int = None, cell_address: str = None) -> bool:
        try:
            self._ensure_active("select_cell")

            if cell_address:
                address = cell_address.upper()
            elif row is not None and column is not None:
                address = ExcelConfig.get_cell_address(row, column)
            else:
                raise ValueError("select_cell requires 'cell_address' or both 'row' and 'column'")

            send_keys(ExcelConfig.get_shortcut('go_to'))
            time.sleep(ExcelConfig.get_timing('cell_selection'))
            send_keys(address)
            time.sleep(ExcelConfig.get_timing('cell_selection'))
            send_keys('{ENTER}')
            time.sleep(ExcelConfig.get_timing('cell_selection'))
            send_keys('{ESC}')
            time.sleep(ExcelConfig.get_timing('cell_selection'))
            logger.debug(f"Selected cell {address}")
            return True
        except Exception as e:
            logger.error(f"Failed to select cell: {e}", exc_info=True)
            return False

    def input_text(self, text: str) -> bool:
        try:
            self._ensure_active("input_text")
            send_keys(str(text), with_spaces=True)
            time.sleep(ExcelConfig.get_timing('text_input'))
            send_keys('{ENTER}')
            logger.debug(f"Input text: {text}")
            return True
        except Exception as e:
            logger.error(f"Failed to input text: {e}", exc_info=True)
            return False

    def execute_ribbon_shortcut(self, shortcut_key: str) -> bool:
        try:
            if not shortcut_key:
                raise ValueError("shortcut_key is required")

            self._ensure_active("execute_ribbon_shortcut")
            send_keys('%')
            time.sleep(ExcelConfig.get_timing('text_input'))

            if '>' in shortcut_key:
                for part in [p.strip().upper() for p in shortcut_key.split('>')]:
                    send_keys(part)
                    time.sleep(ExcelConfig.get_timing('ribbon_operation'))
            else:
                send_keys(shortcut_key.upper())
                time.sleep(ExcelConfig.get_timing('ribbon_operation'))

            logger.debug(f"Executed ribbon shortcut: {shortcut_key}")
            return True
        except Exception as e:
            logger.error(f"Failed to execute ribbon shortcut: {e}", exc_info=True)
            return False

    def save(self, file_path: Optional[str] = None) -> bool:
        try:
            self._ensure_active("save")
            if file_path:
                send_keys(ExcelConfig.get_shortcut('save_as'))
                time.sleep(ExcelConfig.get_timing('file_operation'))
                send_keys(file_path)
                time.sleep(ExcelConfig.get_timing('text_input'))
                send_keys('{ENTER}')
            else:
                send_keys(ExcelConfig.get_shortcut('save_file'))

            time.sleep(ExcelConfig.get_timing('file_operation'))
            logger.debug("Saved workbook")
            return True
        except Exception as e:
            logger.error(f"Failed to save workbook: {e}", exc_info=True)
            return False

    def close_workbook(self, save: bool = False) -> bool:
        try:
            if not self.app:
                logger.debug("Excel not running; nothing to close")
                return True

            self._ensure_active("close_workbook")
            send_keys(ExcelConfig.get_shortcut('close_workbook'))
            time.sleep(ExcelConfig.get_timing('file_operation'))

            if save:
                send_keys('{ENTER}')
            else:
                send_keys('n')

            time.sleep(ExcelConfig.get_timing('dialog_wait'))
            logger.debug("Closed workbook")
            return True
        except Exception as e:
            logger.error(f"Failed to close workbook: {e}", exc_info=True)
            self.quit()
            return False

    def quit(self):
        try:
            DriverFactory.close_excel()
        except Exception:
            logger.debug("Excel termination raised but was ignored", exc_info=True)

        self._app = None
        self._window = None
        self._cleanup_recovery_files()
        logger.debug("Excel quit and cleanup complete")

    def handle_dialog(self, title_patterns, key_action: str = '{ESC}', timeout: float = 10) -> bool:
        try:
            if isinstance(title_patterns, str):
                title_patterns = [title_patterns]

            from pywinauto.findwindows import find_window

            logger.debug(f"Waiting for dialog up to {timeout}s. Patterns: {title_patterns}")
            start_time = time.time()
            dialog_handle = None

            while time.time() - start_time < timeout:
                for pattern in title_patterns:
                    try:
                        dialog_handle = find_window(title_re=f".*{pattern}.*")
                        if dialog_handle:
                            break
                    except Exception:
                        continue
                if dialog_handle:
                    break
                time.sleep(ExcelConfig.get_timing('dialog_check_interval'))

            if not dialog_handle:
                logger.debug("No dialog detected")
                return True

            time.sleep(ExcelConfig.get_timing('dialog_wait'))
            send_keys(key_action)
            time.sleep(ExcelConfig.get_timing('dialog_wait', 0.2))
            logger.debug("Dialog handled")
            return True
        except Exception as e:
            logger.error(f"Failed to handle dialog: {e}", exc_info=True)
            return False

    # ----- cleanup -----
    def _cleanup_recovery_files(self):
        try:
            recovery_paths = [
                os.path.expanduser("~/AppData/Local/Microsoft/Office/UnsavedFiles"),
                os.path.expanduser("~/AppData/Roaming/Microsoft/Excel"),
            ]

            recovery_patterns = [
                "*.xlsx~*",
                "*.xls~*",
                "*[Recovered]*",
                "*~$*.xlsx",
                "*~$*.xls",
            ]

            desktop_path = os.path.expanduser("~/Desktop")
            if os.path.exists(desktop_path):
                desktop_recovery_patterns = ["*~$*.xlsx", "*~$*.xls"]
                for pattern in desktop_recovery_patterns:
                    for file_path in glob.glob(os.path.join(desktop_path, pattern)):
                        try:
                            if file_path in self.copied_files:
                                continue
                            os.remove(file_path)
                            logger.debug(f"Removed desktop recovery file: {file_path}")
                        except Exception:
                            logger.debug("Failed to remove desktop recovery file", exc_info=True)

            for recovery_path in recovery_paths:
                if not os.path.exists(recovery_path):
                    continue
                for pattern in recovery_patterns:
                    for file_path in glob.glob(os.path.join(recovery_path, pattern)):
                        try:
                            os.remove(file_path)
                            logger.debug(f"Removed recovery file: {file_path}")
                        except Exception:
                            logger.debug("Failed to remove recovery file", exc_info=True)
        except Exception:
            logger.debug("Recovery file cleanup failed", exc_info=True)

    @classmethod
    def reset(cls):
        try:
            DriverFactory.close_excel()
        except Exception:
            logger.debug("Excel close in reset ignored", exc_info=True)

        cls.copied_files = []

from src.pages.base_page import BasePage

class NotepadPage(BasePage):
    def __init__(self):
        # Notepad title: "Untitled - Notepad" or "無題 - メモ帳"
        # Support both English and Japanese
        super().__init__(title_re=".*(Notepad|メモ帳).*")

    @property
    def window(self):
        # Prioritize searching by process ID for performance (Process Scope).
        # This avoids scanning the entire Desktop which is very slow when many windows are open.
        from src.utils.driver_factory import get_process_ids_by_name
        from pywinauto import Application, Desktop

        # 1. Try to connect to notepad.exe processes directly
        pids = get_process_ids_by_name("notepad.exe")
        for pid in pids:
            try:
                app = Application(backend='uia').connect(process=pid)
                # Search within this app's process
                win = app.window(title_re=self.title_re, found_index=0)
                if win.exists(timeout=1):
                    return win
            except Exception:
                continue

        # 2. Fallback to Desktop scope (Slower)
        # Modern Notepad app launching behavior often detaches from the initial process handle
        # or implies a package process that might be tricky to catch by name purely.
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Process ID search failed. Falling back to full Desktop search. This may take some time...")
        return Desktop(backend='uia').window(title_re=self.title_re, found_index=0)

    @property
    def editor(self):
        # Modern Notepad (Win11) often uses 'Document' control type for the main text area.
        # It might also be nested.
        # Let's try to find a child that is 'Document' or 'Edit'.
        
        # Strategy 1: Look for 'Document' (Modern)
        doc = self.window.child_window(control_type="Document")
        if doc.exists(timeout=1):
            return doc
            
        # Strategy 2: Look for 'Edit' (Classic)
        edit = self.window.child_window(control_type="Edit")
        return edit

    @property
    def menu_bar(self):
         return self.window.child_window(control_type="MenuBar")

    @property
    def file_menu(self):
        # "File" menu. In Japanese "ファイル".
        # Modern Notepad might put this in a different place or style, but standard UIA often finds it by name.
        # Try finding by title "File" or "ファイル"
        return self.window.child_window(title_re=".*(File|ファイル).*", control_type="MenuItem")

    @property
    def exit_menu_item(self):
        # "Exit" menu item. In Japanese "終了".
        # This usually appears after clicking "File".
        # It is often a child of the Menu or the Window (depending on UIA tree structure after expansion).
        # We can try to find it under the window (assuming it pops up as a context menu or similar)
        return self.window.child_window(title_re=".*(Exit|終了).*", control_type="MenuItem")

    @property
    def save_as_menu_item(self):
        # "Save As" menu item. In Japanese "名前を付けて保存".
        return self.window.child_window(title_re=".*(Save [Aa]s|名前を付けて保存).*", control_type="MenuItem")

    @property
    def save_dialog(self):
        # Save dialog window. In Japanese "名前を付けて保存".
        # Windows 11 modern Notepad shows save dialog as a child window of the main Notepad window,
        # NOT as a separate desktop-level window.
        # Search for child window with title containing "保存" or "Save"
        return self.window.child_window(title_re=".*(名前を付けて保存|Save As).*", control_type="Window")

    @property
    def cancel_button(self):
        # Cancel button in save dialog. In Japanese "キャンセル".
        # Windows 11 modern Notepad: the cancel button is a descendant of the main window,
        # not inside a separate dialog window.
        # See docs/knowledge/use_descendants.md for why we use descendants()
        try:
            # Get the main window wrapper and search all descendants
            window_wrapper = self.window.wrapper_object()
            buttons = window_wrapper.descendants(control_type="Button")
            for btn in buttons:
                try:
                    text = btn.window_text()
                    # Match "キャンセル" or "Cancel"
                    if "キャンセル" in text or "Cancel" in text:
                        return btn
                except:
                    continue
        except Exception:
            pass
        return None

    @property
    def save_confirmation_dialog(self):
        # Save confirmation dialog when closing without saving. In Japanese "メモ帳".
        from pywinauto import Desktop
        return Desktop(backend='uia').window(title_re=".*(Notepad|メモ帳).*", control_type="Window", found_index=0)

    @property
    def dont_save_button(self):
        # "Don't Save" button in save confirmation dialog. In Japanese "保存しない".
        return self.save_confirmation_dialog.child_window(title_re=".*(Don't [Ss]ave|保存しない).*", control_type="Button")



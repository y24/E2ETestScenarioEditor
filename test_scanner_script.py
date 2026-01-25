import os
import ast
from pathlib import Path

def scan_page_objects(root_dir: str):
    targets = []
    root_path = Path(root_dir)
    
    for str_path in root_path.rglob("*.py"):
        path = Path(str_path)
        relative_path = path.relative_to(root_path)
        
        # Folder segments
        parts = list(relative_path.parts)
        # Remove extension from the last part (filename)
        parts[-1] = parts[-1][:-3]
        
        # Calculate python module path prefix
        # If file is in root (e.g. base_page.py), prefix is empty? 
        # User constraint: "base_page.BasePage.window" (folder omitted)
        # "app.notepad_page.NotepadPage.editor" (folder included)
        
        # If the file is directly under root_dir, we likely want just "filename" not ".filename"
        # Wait, the user said:
        # "フォルダのrootにもページオブジェクトある場合があります（base_page.py）。その場合、フォルダ部分は省略されて、base_page.BasePage.window のようになります。"
        # So: base_page (module) . BasePage (class) . window (method)
        # "app.notepad_page.NotepadPage.editor" -> app (folder) . notepad_page (module) . ...
        
        # So we just join parts with dot
        module_path = ".".join(parts)
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read())
                
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    class_name = node.name
                    for item in node.body:
                        if isinstance(item, ast.FunctionDef):
                            method_name = item.name
                            if not method_name.startswith("_"):
                                target = f"{module_path}.{class_name}.{method_name}"
                                targets.append({
                                    "target": target,
                                    "doc": ast.get_docstring(item) or ""
                                })
        except Exception as e:
            print(f"Error parsing {path}: {e}")
            
    return targets

if __name__ == "__main__":
    test_dir = os.path.join(os.getcwd(), "test_scans")
    results = scan_page_objects(test_dir)
    for r in results:
        print(r["target"])

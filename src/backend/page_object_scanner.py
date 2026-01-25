import os
import ast
from pathlib import Path
from typing import List, Dict

def scan_page_objects(root_dir: str) -> List[Dict[str, str]]:
    targets = []
    root_path = Path(root_dir)
    
    if not root_path.exists():
        return []
    
    for str_path in root_path.rglob("*.py"):
        path = Path(str_path)
        
        try:
            relative_path = path.relative_to(root_path)
        except ValueError:
             continue # Should not happen with rglob but safe check
        
        # Folder segments
        parts = list(relative_path.parts)
        # Remove extension from the last part (filename)
        if parts[-1].endswith(".py"):
            parts[-1] = parts[-1][:-3]
        
        # Calculate python module path prefix
        # "app.notepad_page.NotepadPage.editor"
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
            
    # Sort results
    targets.sort(key=lambda x: x["target"])
    return targets

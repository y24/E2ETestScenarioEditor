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
                    # Add class itself as a target
                    class_target = f"{module_path}.{class_name}"
                    targets.append({
                        "target": class_target,
                        "doc": ast.get_docstring(node) or ""
                    })
                    
                    # Inside the class, find methods and properties
                    for item in node.body:
                        name = None
                        doc = ""
                        
                        if isinstance(item, ast.FunctionDef):
                            name = item.name
                            doc = ast.get_docstring(item) or ""
                        elif isinstance(item, ast.AsyncFunctionDef):
                            name = item.name
                            doc = ast.get_docstring(item) or ""
                        
                        if name and not name.startswith("_"):
                            target = f"{class_target}.{name}"
                            targets.append({
                                "target": target,
                                "doc": doc
                            })
        except Exception as e:
            print(f"Error parsing {path}: {e}")
            
    # Sort results
    targets.sort(key=lambda x: x["target"])
    return targets

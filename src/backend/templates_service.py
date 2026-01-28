
import json
import os
import time
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

TEMPLATES_FILE_NAME = "user_templates.json"
TEMPLATES_PATH = os.path.join(os.getcwd(), TEMPLATES_FILE_NAME)

class TemplateItem(BaseModel):
    id: str
    name: str
    steps: List[Dict[str, Any]]
    createdAt: float
    isFavorite: bool = False

class TemplatesService:
    @staticmethod
    def _load_templates() -> List[Dict[str, Any]]:
        if not os.path.exists(TEMPLATES_PATH):
            return []
        try:
            with open(TEMPLATES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading templates: {e}")
            return []

    @staticmethod
    def _save_templates(templates: List[Dict[str, Any]]):
        try:
            with open(TEMPLATES_PATH, "w", encoding="utf-8") as f:
                json.dump(templates, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving templates: {e}")
            raise e

    @classmethod
    def get_templates(cls) -> List[Dict[str, Any]]:
        # Sort by favorite (desc), then createdAt (desc)
        templates = cls._load_templates()
        templates.sort(key=lambda x: (-1 if x.get("isFavorite") else 0, -x.get("createdAt", 0)))
        return templates

    @classmethod
    def save_template(cls, name: str, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
        templates = cls._load_templates()
        new_template = {
            "id": str(uuid.uuid4()),
            "name": name,
            "steps": steps,
            "createdAt": time.time(),
            "isFavorite": False
        }
        templates.insert(0, new_template)
        cls._save_templates(templates)
        return new_template

    @classmethod
    def delete_template(cls, template_id: str):
        templates = cls._load_templates()
        templates = [t for t in templates if t["id"] != template_id]
        cls._save_templates(templates)

    @classmethod
    def toggle_favorite(cls, template_id: str) -> Optional[Dict[str, Any]]:
        templates = cls._load_templates()
        target = None
        for t in templates:
            if t["id"] == template_id:
                t["isFavorite"] = not t.get("isFavorite", False)
                target = t
                break
        
        if target:
            cls._save_templates(templates)
            
        return target

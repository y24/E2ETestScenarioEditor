
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
    favoritedAt: Optional[float] = None

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
        # Sort by:
        # 1. Favorites (recently favorited first)
        # 2. Non-favorites (recently created/saved first)
        templates = cls._load_templates()
        
        def sort_key(x):
            if x.get("isFavorite"):
                # Group 0 (Favorites), sort by favoritedAt desc (newer timestamp = smaller negative number)
                # If favoritedAt is missing (legacy), treat as 0 (oldest)
                return (0, -x.get("favoritedAt", 0))
            else:
                # Group 1 (Non-favorites), sort by createdAt desc
                return (1, -x.get("createdAt", 0))

        templates.sort(key=sort_key)
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
                new_state = not t.get("isFavorite", False)
                t["isFavorite"] = new_state
                if new_state:
                    t["favoritedAt"] = time.time()
                else:
                    # Optional: Remove favoritedAt or keep it?
                    # Cleaner to remove or ignore it.
                    if "favoritedAt" in t:
                        del t["favoritedAt"]
                target = t
                break
        
        if target:
            cls._save_templates(templates)
            
        return target

    @classmethod
    def update_template(cls, template_id: str, name: str, steps: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        templates = cls._load_templates()
        target = None
        for t in templates:
            if t["id"] == template_id:
                t["name"] = name
                t["steps"] = steps
                # Update createdAt to reflect modification? The requirement says "recently saved".
                # Current implementation uses createdAt which is confusingly named but seems to define the order.
                # If "recently saved order" implies recently MODIFIED, I should update createdAt or add updatedAt.
                # The prompt says "recently saved order" for non-favorites.
                # Currently save_template sets createdAt. update_template didn't list it.
                # The user says "conventional recently saved order".
                # If the convention was just createdAt (creation time), then I keep it.
                # But typically "recently saved" means modification time.
                # Let's check if the user previously edited this file or if I should assume createdAt is fine.
                # The user's prompt: "Templates that are not in favorites should remain in the conventional recently saved order."
                # "Conventional" implies "keep doing what you were doing".
                # Previous code in update_template didn't update createdAt. So I will leave it alone to be safe.
                target = t
                break
        
        if target:
            cls._save_templates(templates)
            
        return target

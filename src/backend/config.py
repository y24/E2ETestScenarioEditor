import os
import json
from pydantic import BaseModel
from typing import Optional

CONFIG_FILE_NAME = "config.json"
# プロジェクトルートに保存
CONFIG_PATH = os.path.join(os.getcwd(), CONFIG_FILE_NAME)

class AppConfig(BaseModel):
    scenarios_dir: Optional[str] = None
    scenarios_shared_dir: Optional[str] = None
    ui_settings: Optional[dict] = {}

def load_config() -> AppConfig:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return AppConfig(**data)
        except Exception as e:
            print(f"Error loading config: {e}")
            return AppConfig()
    return AppConfig()

def save_config(config: AppConfig) -> None:
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            f.write(config.model_dump_json(indent=2))
    except Exception as e:
        print(f"Error saving config: {e}")
        raise e

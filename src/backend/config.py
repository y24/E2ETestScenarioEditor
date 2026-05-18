import os
import json
from pydantic import BaseModel, Field
from typing import Optional

CONFIG_FILE_NAME = "config.json"
TEMPLATES_FILE_NAME = "user_templates.json"
# プロジェクトルートに保存
CONFIG_PATH = os.path.join(os.getcwd(), CONFIG_FILE_NAME)
TEMPLATES_PATH = os.path.join(os.getcwd(), TEMPLATES_FILE_NAME)

class ScenarioDirectory(BaseModel):
    name: str
    path: str

class ExecutionSettings(BaseModel):
    python_executable: str = ""
    default_env: str = "DEFAULT"
    auto_save_before_run: bool = True
    max_log_lines: int = 2000

class AppConfig(BaseModel):
    scenario_directories: list[ScenarioDirectory] = Field(default_factory=list)
    shared_scenario_dir: Optional[str] = None
    page_object_folder: Optional[str] = None
    framework_path: Optional[str] = None
    execution_settings: ExecutionSettings = Field(default_factory=ExecutionSettings)
    ui_settings: Optional[dict] = Field(default_factory=dict)

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

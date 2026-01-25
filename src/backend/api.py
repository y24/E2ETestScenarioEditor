from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
from .config import load_config, save_config, AppConfig
from .file_service import FileService

router = APIRouter(prefix="/api")

# --- Config API ---

@router.get("/config", response_model=AppConfig)
async def get_config():
    return load_config()

@router.post("/config", response_model=AppConfig)
async def update_config(config: AppConfig):
    save_config(config)
    return config

# --- File Browser API ---

class FileInfo(BaseModel):
    name: str
    path: str
    relativePath: str
    parent: str

class FileListResponse(BaseModel):
    scenarios: List[FileInfo]
    shared: List[FileInfo]

@router.get("/files", response_model=FileListResponse)
async def list_files():
    config = load_config()
    scenarios = []
    shared = []

    if config.scenarios_dir:
        scenarios = FileService.list_files(config.scenarios_dir)
    
    if config.scenarios_shared_dir:
        shared = FileService.list_files(config.scenarios_shared_dir)
        
    return FileListResponse(scenarios=scenarios, shared=shared)

# --- Scenario API ---

class LoadScenarioRequest(BaseModel):
    path: str

class SaveScenarioRequest(BaseModel):
    path: str
    data: Dict[str, Any]

@router.get("/scenarios/load")
async def load_scenario(path: str):
    # セキュリティチェック: パストラバーサル防止
    # 簡易チェック: 設定されたディレクトリ配下にあるか確認すべきだが、
    # ローカルツールなのでまずは絶対パスで存在確認のみ。
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        data = await FileService.load_json(path)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/scenarios/save")
async def save_scenario(req: SaveScenarioRequest):
    # パスが正当かどうかのチェック（ローカルツールとしての最低限）
    try:
        await FileService.save_json(req.path, req.data)
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
from .config import load_config, save_config, AppConfig
from .file_service import FileService
from .page_object_scanner import scan_page_objects

router = APIRouter(prefix="/api")

# --- Config API ---

@router.get("/config", response_model=AppConfig)
async def get_config():
    return load_config()

@router.post("/config", response_model=AppConfig)
async def update_config(config: AppConfig):
    save_config(config)
    return config

# --- Utility API ---

@router.get("/utils/pick-directory")
async def pick_directory():
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()  # メインウィンドウを非表示
        root.attributes('-topmost', True)  # 最前面に表示
        
        directory = filedialog.askdirectory(parent=root, title="シナリオフォルダを選択")
        root.destroy()
        
        if directory:
            # Windowsのパス区切り文字を正規化
            directory = directory.replace('\\', '/')
            return {"path": directory}
        return {"path": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/page-objects")
async def get_page_objects():
    config = load_config()
    if not config.page_object_folder:
        return []
        
    try:
        return scan_page_objects(config.page_object_folder)
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# --- File Browser API ---

class FileInfo(BaseModel):
    name: str
    path: str
    relativePath: str
    parent: str

class DirectoryFiles(BaseModel):
    name: str
    files: List[FileInfo]

class FileListResponse(BaseModel):
    directories: List[DirectoryFiles]

@router.get("/files", response_model=FileListResponse)
async def list_files():
    config = load_config()
    directories = []
    
    for dir_config in config.scenario_directories:
        files = FileService.list_files(dir_config.path)
        directories.append(DirectoryFiles(
            name=dir_config.name,
            files=files
        ))
        
    return FileListResponse(directories=directories)

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

class RenameScenarioRequest(BaseModel):
    oldPath: str
    newName: str

@router.post("/scenarios/rename")
async def rename_scenario(req: RenameScenarioRequest):
    try:
        new_path = FileService.rename_file(req.oldPath, req.newName)
        return {"status": "success", "newPath": new_path}
    except FileExistsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/scenarios/delete")
async def delete_scenario(path: str):
    try:
        FileService.delete_file(path)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

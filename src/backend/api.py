from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
from .config import load_config, save_config, AppConfig
from .file_service import FileService
from .page_object_scanner import scan_page_objects
from .templates_service import TemplatesService

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
    scenarioName: Optional[str] = ""

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

    if config.shared_scenario_dir and os.path.exists(config.shared_scenario_dir):
        files = FileService.list_files(config.shared_scenario_dir)
        directories.append(DirectoryFiles(
            name="scenarios_shared",
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
        last_modified = os.path.getmtime(path)
        return {
            "data": data,
            "last_modified": last_modified
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/scenarios/status")
async def check_file_status(path: str):
    if not os.path.exists(path):
         raise HTTPException(status_code=404, detail="File not found")
    try:
        return {"last_modified": os.path.getmtime(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveScenarioRequest(BaseModel):
    path: str
    data: Dict[str, Any]
    last_modified: Optional[float] = None
    force: Optional[bool] = False

@router.post("/scenarios/save")
async def save_scenario(req: SaveScenarioRequest):
    # パスが正当かどうかのチェック（ローカルツールとしての最低限）
    try:
        file_exists = os.path.exists(req.path)

        # Safety Check: Require last_modified for existing files if not forced
        if file_exists and not req.force and req.last_modified is None:
             print("[ERROR] Missing last_modified for existing file. Rejecting save.")
             raise HTTPException(
                status_code=422,
                detail="Missing concurrency token. Please reload the editor."
             )

        # Conflict Check
        if not req.force and req.last_modified is not None and file_exists:
            current_mtime = os.path.getmtime(req.path)
            
            # Allow some small epsilon for clock differences or filesystem precision, 
            # but usually equality or strictly greater check is fine.
            # If disk version is newer than loaded version, it's a conflict.
            if current_mtime > req.last_modified + 0.001: 
                raise HTTPException(
                    status_code=409, 
                    detail="File on disk has changed.",
                    headers={"X-Current-Modified": str(current_mtime)}
                )

        await FileService.save_json(req.path, req.data)
        new_mtime = os.path.getmtime(req.path)
        return {"status": "success", "path": req.path, "last_modified": new_mtime}
    except HTTPException:
        raise
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

# --- Templates API ---

@router.get("/templates")
async def get_templates():
    return TemplatesService.get_templates()

class CreateTemplateRequest(BaseModel):
    name: str
    steps: List[Dict[str, Any]]

@router.post("/templates")
async def create_template(req: CreateTemplateRequest):
    return TemplatesService.save_template(req.name, req.steps)

@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    TemplatesService.delete_template(template_id)
    return {"status": "success"}

@router.post("/templates/{template_id}/favorite")
async def toggle_template_favorite(template_id: str):
    result = TemplatesService.toggle_favorite(template_id)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result

class UpdateTemplateRequest(BaseModel):
    name: str
    steps: List[Dict[str, Any]]

@router.put("/templates/{template_id}")
async def update_template(template_id: str, req: UpdateTemplateRequest):
    result = TemplatesService.update_template(template_id, req.name, req.steps)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result


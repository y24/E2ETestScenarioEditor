from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from typing import List, Dict, Any, Optional
import os
import subprocess
import sys
from pathlib import Path
from .config import load_config, save_config, AppConfig
from .file_service import FileService
from .page_object_scanner import scan_page_objects
from .templates_service import TemplatesService
from .debug_session_service import (
    DebugSessionCloseRequest,
    DebugSessionCreateRequest,
    DebugSessionRunRequest,
    debug_session_service,
)

router = APIRouter(prefix="/api")

# --- Config API ---

@router.get("/config", response_model=AppConfig)
async def get_config():
    return load_config()

@router.post("/config", response_model=AppConfig)
async def update_config(config_data: Dict[str, Any] = Body(...)):
    current_config = load_config()
    current_config_dict = current_config.model_dump()
    
    # Deep merge logic for ui_settings
    if "ui_settings" in config_data and isinstance(config_data["ui_settings"], dict):
         # Update existing ui_settings with new values
         current_ui_settings = current_config_dict.get("ui_settings") or {}
         current_ui_settings.update(config_data["ui_settings"])
         config_data["ui_settings"] = current_ui_settings
    
    # Update other fields that are present in the request
    for key, value in config_data.items():
        current_config_dict[key] = value
    
    new_config = AppConfig(**current_config_dict)
    save_config(new_config)
    return new_config

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


class OpenPathRequest(BaseModel):
    path: str


@router.post("/utils/open-path")
async def open_path(req: OpenPathRequest):
    try:
        raw_path = (req.path or "").strip()
        if not raw_path:
            raise HTTPException(status_code=400, detail="Path is required")

        path = Path(raw_path).expanduser().resolve()
        if not path.exists():
            raise HTTPException(status_code=404, detail="Path not found")

        target = path if path.is_dir() else path.parent
        if os.name == "nt":
            subprocess.Popen(["explorer", str(target)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])

        return {"status": "success", "path": str(target)}
    except HTTPException:
        raise
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

@router.get("/page-objects/scan")
async def scan_target(target: str):
    """
    Scans specifically for the given target (and its file).
    Returns the list of targets found in the corresponding file.
    """
    config = load_config()
    if not config.page_object_folder:
        return []
    
    try:
        from .page_object_scanner import find_file_by_target, scan_file
        from pathlib import Path
        
        file_path = find_file_by_target(target, config.page_object_folder)
        
        if file_path:
             root_path = Path(config.page_object_folder)
             return scan_file(file_path, root_path)
             
        # If file not found efficiently, maybe fallback or return empty
        # For now, return empty creates no harm (client keeps current state)
        return []
        
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# --- Debug Session API ---

@router.get("/debug-sessions/framework/validate")
async def validate_debug_framework():
    return debug_session_service.validate_framework()

@router.post("/debug-sessions")
async def create_debug_session(req: DebugSessionCreateRequest):
    try:
        return debug_session_service.create_session(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug-sessions/active")
async def get_active_debug_session():
    try:
        return debug_session_service.get_active_session()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug-sessions/{session_id}")
async def get_debug_session(session_id: str):
    try:
        return debug_session_service.get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug-sessions/{session_id}/logs")
async def get_debug_session_logs(session_id: str, offset: int = 0):
    try:
        return debug_session_service.get_logs(session_id, offset=offset)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debug-sessions/{session_id}/run")
async def run_debug_session(session_id: str, req: DebugSessionRunRequest):
    try:
        return await run_in_threadpool(debug_session_service.run, session_id, req)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debug-sessions/{session_id}/next")
async def next_debug_session(session_id: str):
    try:
        return debug_session_service.next(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debug-sessions/{session_id}/cancel")
async def cancel_debug_session(session_id: str):
    try:
        return debug_session_service.cancel(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/debug-sessions/{session_id}")
async def close_debug_session(session_id: str, req: DebugSessionCloseRequest = Body(default={})):
    try:
        return debug_session_service.close(session_id, req)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debug-sessions/{session_id}/force-kill")
async def force_kill_debug_session(session_id: str):
    try:
        return debug_session_service.force_kill(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Debug session not found")
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


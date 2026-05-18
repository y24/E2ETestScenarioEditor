import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, Optional

from pydantic import BaseModel

from .config import AppConfig, load_config


class DebugSessionCreateRequest(BaseModel):
    scenario_path: str
    scenario_id: Optional[str] = None
    env: Optional[str] = None


class DebugSessionRunRequest(BaseModel):
    mode: str
    section: str = "steps"
    step_start: Optional[int] = None
    step_end: Optional[int] = None
    rerun_executed: bool = False


class DebugSessionCloseRequest(BaseModel):
    run_teardown: Optional[bool] = None
    close_resources: Optional[bool] = None


class DebugSessionService:
    def __init__(self):
        self._lock = threading.RLock()
        self._process: Optional[subprocess.Popen] = None
        self._base_url: Optional[str] = None
        self._session_id: Optional[str] = None
        self._section_lengths: Dict[str, int] = {}
        self._stderr: Deque[str] = deque(maxlen=200)

    def validate_framework(self) -> Dict[str, Any]:
        config = load_config()
        try:
            path = self._validate_framework_path(config)
            script = path / "scripts" / "debug_server.py"
            if not script.exists():
                raise ValueError("Framework Path is missing scripts/debug_server.py")
            return {"valid": True, "path": str(path)}
        except Exception as exc:
            return {"valid": False, "path": config.framework_path, "error": str(exc)}

    def create_session(self, request: DebugSessionCreateRequest) -> Dict[str, Any]:
        config = load_config()
        framework_path = self._validate_framework_path(config)
        scenario_path = self._validate_scenario_path(config, request.scenario_path)
        env = request.env or config.execution_settings.default_env or "DEFAULT"

        with self._lock:
            if self._session_id:
                if self._has_live_session_locked():
                    raise ValueError("A debug session is already active")
                self._clear_session_locked()
            self._ensure_server(config, framework_path, env)
            state = self._request(
                "POST",
                "/sessions",
                {
                    "scenario_path": str(scenario_path),
                    "scenario_id": request.scenario_id,
                    "env": env,
                },
            )
            self._session_id = state["session_id"]
            self._section_lengths = self._load_section_lengths(scenario_path, request.scenario_id)
            return state

    def get_active_session(self) -> Dict[str, Any]:
        with self._lock:
            session_id = self._session_id
            if not session_id:
                return {"active": False, "session": None}

        try:
            state = self.get_session(session_id)
            return {"active": True, "session": state}
        except Exception:
            with self._lock:
                self._clear_session_locked()
            self._shutdown_server()
            return {"active": False, "session": None}

    def get_session(self, session_id: str) -> Dict[str, Any]:
        self._require_session(session_id)
        return self._request("GET", f"/sessions/{session_id}")

    def get_logs(self, session_id: str, offset: int = 0) -> Dict[str, Any]:
        self._require_session(session_id)
        return self._request("GET", f"/sessions/{session_id}/logs?offset={offset}")

    def run(self, session_id: str, request: DebugSessionRunRequest) -> Dict[str, Any]:
        self._require_session(session_id)
        if request.mode not in {"all", "until", "single", "range", "teardown"}:
            raise ValueError("Invalid debug run mode")

        payload = request.model_dump()
        if request.mode == "all":
            payload["mode"] = "range"
            payload["section"] = request.section or "steps"
            payload["step_start"] = 0
            if payload.get("step_end") is None:
                length = self._section_lengths.get(payload["section"], 0)
                if length == 0:
                    raise ValueError(f"No steps in section: {payload['section']}")
                payload["step_end"] = length - 1
        return self._request("POST", f"/sessions/{session_id}/run", payload)

    def next(self, session_id: str) -> Dict[str, Any]:
        self._require_session(session_id)
        return self._request("POST", f"/sessions/{session_id}/next", {})

    def cancel(self, session_id: str) -> Dict[str, Any]:
        self._require_session(session_id)
        return self._request("POST", f"/sessions/{session_id}/cancel", {})

    def close(self, session_id: str, request: DebugSessionCloseRequest) -> Dict[str, Any]:
        config = load_config()
        self._require_session(session_id)
        payload = {
            "run_teardown": (
                config.execution_settings.debug_run_teardown_on_close
                if request.run_teardown is None
                else request.run_teardown
            ),
            "close_resources": (
                config.execution_settings.debug_auto_close_resources
                if request.close_resources is None
                else request.close_resources
            ),
        }
        state = self._request("DELETE", f"/sessions/{session_id}", payload)
        with self._lock:
            self._session_id = None
            self._section_lengths = {}
        if payload["close_resources"]:
            self._shutdown_server()
        return state

    def force_kill(self, session_id: str) -> Dict[str, Any]:
        self._require_session(session_id)
        with self._lock:
            pid = self._process.pid if self._process else None
            self._kill_process()
            self._session_id = None
            self._section_lengths = {}
            self._base_url = None
            return {"session_id": session_id, "status": "killed", "pid": pid}

    def _ensure_server(self, config: AppConfig, framework_path: Path, env: str) -> None:
        if self._process and self._process.poll() is None and self._base_url:
            return

        python_executable = self._resolve_python(config, framework_path)
        host = config.execution_settings.debug_server_host or "127.0.0.1"
        if host != "127.0.0.1":
            raise ValueError("Debug server host must be 127.0.0.1")
        port = config.execution_settings.debug_server_port
        command = [
            python_executable,
            "scripts/debug_server.py",
            "--host",
            host,
            "--port",
            str(port),
            "--env",
            env,
        ]
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        self._stderr.clear()
        process = subprocess.Popen(
            command,
            cwd=str(framework_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creationflags,
            start_new_session=os.name != "nt",
        )
        self._process = process
        threading.Thread(target=self._read_stderr, args=(process,), daemon=True).start()

        deadline = time.time() + 15
        first_line = ""
        while time.time() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Debug server exited: {'; '.join(self._stderr)}")
            first_line = process.stdout.readline() if process.stdout else ""
            if first_line:
                break
            time.sleep(0.05)
        if not first_line:
            self._kill_process()
            raise RuntimeError("Debug server did not report a port")

        try:
            info = json.loads(first_line)
            self._base_url = f"http://{info['host']}:{info['port']}"
        except Exception as exc:
            self._kill_process()
            raise RuntimeError(f"Invalid debug server startup response: {first_line}") from exc

    def _shutdown_server(self) -> None:
        with self._lock:
            if not self._process or self._process.poll() is not None or not self._base_url:
                self._base_url = None
                return
            try:
                self._request("POST", "/shutdown", {})
                self._process.wait(timeout=5)
            except Exception:
                self._kill_process()
            finally:
                self._base_url = None
                self._process = None

    def _kill_process(self) -> None:
        process = self._process
        if not process or process.poll() is not None:
            self._process = None
            return
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
            else:
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        finally:
            self._process = None

    def _has_live_session_locked(self) -> bool:
        try:
            self._request("GET", f"/sessions/{self._session_id}")
            return True
        except Exception:
            return False

    def _clear_session_locked(self) -> None:
        self._session_id = None
        self._section_lengths = {}

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self._base_url:
            raise RuntimeError("Debug server is not running")
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(f"{self._base_url}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(body)
                message = detail.get("message") or detail.get("error") or body
            except Exception:
                message = body
            raise RuntimeError(message) from exc

    def _read_stderr(self, process: subprocess.Popen) -> None:
        if not process.stderr:
            return
        for line in iter(process.stderr.readline, ""):
            self._stderr.append(line.rstrip("\n"))
        process.stderr.close()

    def _resolve_python(self, config: AppConfig, framework_path: Path) -> str:
        configured = (config.execution_settings.python_executable or "").strip()
        if configured:
            return configured
        candidates = [
            framework_path / ".venv" / "Scripts" / "python.exe",
            framework_path / "venv" / "Scripts" / "python.exe",
            framework_path / ".venv" / "bin" / "python",
        ]
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return sys.executable

    def _validate_framework_path(self, config: AppConfig) -> Path:
        if not config.framework_path:
            raise ValueError("Framework Path is not configured")
        framework_path = Path(config.framework_path).expanduser().resolve()
        if not framework_path.is_dir():
            raise ValueError("Framework Path is not a directory")
        required = [framework_path / "tests" / "test_runner.py", framework_path / "pytest.ini"]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise ValueError(f"Framework Path is missing required files: {', '.join(missing)}")
        return framework_path

    def _validate_scenario_path(self, config: AppConfig, scenario_path: str) -> Path:
        path = Path(scenario_path).expanduser().resolve()
        if not path.is_file():
            raise ValueError("Scenario file does not exist")
        allowed_roots = [Path(d.path).expanduser().resolve() for d in config.scenario_directories]
        if config.shared_scenario_dir:
            allowed_roots.append(Path(config.shared_scenario_dir).expanduser().resolve())
        if not any(path == root or root in path.parents for root in allowed_roots if root.exists()):
            raise ValueError("Scenario file is outside configured scenario directories")
        return path

    def _load_section_lengths(self, scenario_path: Path, scenario_id: Optional[str]) -> Dict[str, int]:
        with open(scenario_path, "r", encoding="utf-8") as file:
            data = json.load(file)
        scenarios = data if isinstance(data, list) else [data]
        scenario = None
        for item in scenarios:
            if not scenario_id or item.get("id") == scenario_id:
                scenario = item
                break
        if not scenario:
            return {}
        return {
            section: len(scenario.get(section, [])) if isinstance(scenario.get(section, []), list) else 0
            for section in ("setup", "steps", "teardown")
        }

    def _require_session(self, session_id: str) -> None:
        with self._lock:
            if not self._session_id or self._session_id != session_id:
                raise KeyError(session_id)


debug_session_service = DebugSessionService()

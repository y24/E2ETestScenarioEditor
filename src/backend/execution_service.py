import os
import signal
import subprocess
import sys
import threading
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

from pydantic import BaseModel

from .config import AppConfig, load_config


class ExecutionRequest(BaseModel):
    scenario_path: str
    scenario_id: Optional[str] = None
    mode: str = "full"
    section: str = "steps"
    step_start: Optional[int] = None
    step_end: Optional[int] = None
    env: Optional[str] = None
    include_setup: bool = True
    include_teardown: bool = True


class ExecutionState(BaseModel):
    run_id: str
    status: str
    mode: str
    scenario_path: str
    scenario_id: Optional[str] = None
    section: str = "steps"
    step_start: Optional[int] = None
    step_end: Optional[int] = None
    command: List[str]
    started_at: str
    ended_at: Optional[str] = None
    exit_code: Optional[int] = None
    artifacts: Dict[str, Optional[str]] = {}
    error: Optional[str] = None


class ExecutionService:
    def __init__(self):
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def start(self, request: ExecutionRequest) -> ExecutionState:
        config = load_config()
        framework_path = self._validate_framework_path(config)
        scenario_path = self._validate_scenario_path(config, request.scenario_path)
        self._validate_range(request)

        with self._lock:
            if any(run["state"].status == "running" for run in self._runs.values()):
                raise ValueError("Another execution is already running")

        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        max_log_lines = max(100, config.execution_settings.max_log_lines)
        logs: Deque[Dict[str, str]] = deque(maxlen=max_log_lines)
        command = self._build_command(config, framework_path, scenario_path, request)

        state = ExecutionState(
            run_id=run_id,
            status="starting",
            mode=request.mode,
            scenario_path=str(scenario_path),
            scenario_id=request.scenario_id,
            section=request.section,
            step_start=request.step_start,
            step_end=request.step_end,
            command=command,
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        run = {"state": state, "logs": logs, "process": None, "framework_path": framework_path}
        with self._lock:
            self._runs[run_id] = run

        thread = threading.Thread(target=self._run_process, args=(run_id,), daemon=True)
        thread.start()
        return state

    def get(self, run_id: str) -> ExecutionState:
        run = self._get_run(run_id)
        return run["state"]

    def get_logs(self, run_id: str) -> Dict[str, Any]:
        run = self._get_run(run_id)
        return {"run_id": run_id, "lines": list(run["logs"])}

    def cancel(self, run_id: str) -> ExecutionState:
        run = self._get_run(run_id)
        state = run["state"]
        process = run.get("process")
        if state.status != "running" or process is None:
            return state

        state.status = "cancelling"
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
        except Exception as exc:
            state.error = f"Failed to cancel process: {exc}"
        return state

    def validate_framework(self) -> Dict[str, Any]:
        config = load_config()
        try:
            path = self._validate_framework_path(config)
            return {"valid": True, "path": str(path)}
        except Exception as exc:
            return {"valid": False, "path": config.framework_path, "error": str(exc)}

    def _run_process(self, run_id: str) -> None:
        run = self._get_run(run_id)
        state: ExecutionState = run["state"]
        logs: Deque[Dict[str, str]] = run["logs"]
        framework_path: Path = run["framework_path"]

        try:
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
            process = subprocess.Popen(
                state.command,
                cwd=str(framework_path),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creationflags,
                start_new_session=os.name != "nt",
            )
            run["process"] = process
            state.status = "running"

            readers = [
                threading.Thread(target=self._read_stream, args=(process.stdout, logs, "stdout"), daemon=True),
                threading.Thread(target=self._read_stream, args=(process.stderr, logs, "stderr"), daemon=True),
            ]
            for reader in readers:
                reader.start()

            exit_code = process.wait()
            for reader in readers:
                reader.join(timeout=2)

            state.exit_code = exit_code
            if state.status in {"cancelling", "cancelled"}:
                state.status = "cancelled"
            else:
                state.status = "succeeded" if exit_code == 0 else "failed"
        except Exception as exc:
            state.status = "failed_to_start"
            state.error = str(exc)
            logs.append({"stream": "stderr", "text": str(exc)})
        finally:
            state.ended_at = datetime.now(timezone.utc).isoformat()
            state.artifacts = self._find_artifacts(framework_path, state.started_at)

    def _read_stream(self, stream, logs: Deque[Dict[str, str]], stream_name: str) -> None:
        if stream is None:
            return
        for line in iter(stream.readline, ""):
            logs.append({"stream": stream_name, "text": line.rstrip("\n")})
        stream.close()

    def _build_command(
        self,
        config: AppConfig,
        framework_path: Path,
        scenario_path: Path,
        request: ExecutionRequest,
    ) -> List[str]:
        python_executable = self._resolve_python(config, framework_path)
        env = request.env or config.execution_settings.default_env or "DEFAULT"
        command = [
            python_executable,
            "-m",
            "pytest",
            "tests/test_runner.py",
            "--env",
            env,
            "--scenario-file",
            str(scenario_path),
        ]
        if request.scenario_id:
            command.extend(["--scenario-id", request.scenario_id])
        if request.section:
            command.extend(["--step-section", request.section])
        if request.step_start is not None:
            command.extend(["--step-start", str(request.step_start)])
        if request.step_end is not None:
            command.extend(["--step-end", str(request.step_end)])
        if not request.include_teardown:
            command.append("--skip-teardown")
        return command

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

    def _validate_range(self, request: ExecutionRequest) -> None:
        if request.mode not in {"full", "until", "single", "range"}:
            raise ValueError("Invalid execution mode")
        if request.section not in {"setup", "steps", "teardown"}:
            raise ValueError("Invalid step section")
        for value_name in ("step_start", "step_end"):
            value = getattr(request, value_name)
            if value is not None and value < 0:
                raise ValueError(f"{value_name} must be zero or greater")
        if request.step_start is not None and request.step_end is not None and request.step_start > request.step_end:
            raise ValueError("step_start must be less than or equal to step_end")

    def _find_artifacts(self, framework_path: Path, started_at: str) -> Dict[str, Optional[str]]:
        reports_dir = framework_path / "reports"
        if not reports_dir.exists():
            return {"report": None, "log": None, "meta": None}

        started = datetime.fromisoformat(started_at)
        candidates = [p for p in reports_dir.iterdir() if p.is_dir()]
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)

        for directory in candidates:
            modified = datetime.fromtimestamp(directory.stat().st_mtime, timezone.utc)
            if modified >= started:
                meta = directory / "meta.json"
                report = directory / "report.html"
                logs = list(directory.glob("run_*.log"))
                return {
                    "report": str(report) if report.exists() else None,
                    "log": str(logs[0]) if logs else None,
                    "meta": str(meta) if meta.exists() else None,
                }
        return {"report": None, "log": None, "meta": None}

    def _get_run(self, run_id: str) -> Dict[str, Any]:
        with self._lock:
            run = self._runs.get(run_id)
        if not run:
            raise KeyError(run_id)
        return run


execution_service = ExecutionService()

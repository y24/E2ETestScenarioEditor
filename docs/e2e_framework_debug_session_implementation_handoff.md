# E2EFramework デバッグセッション実装引き継ぎメモ

## 1. このドキュメントの目的

`scenario_execution_feature_plan_v2.md` のうち、E2EFramework 側で必要になる実装だけを切り出し、コーディングエージェントへ再実装を依頼しやすい粒度に整理する。

対象は `D:/Script/E2EFramework` である。Editor 側の FastAPI、UI、設定画面、フロントエンド実装はこのドキュメントでは扱わない。Editor から呼び出される前提の、Framework 側常駐デバッグプロセスとステップ実行機構だけを対象にする。

最初のゴールは以下に絞る。

- `ここまで` で `steps[0]` から選択ステップまで実行する
- 実行後も `Context`、`DriverFactory`、`WebDriverFactory`、対象アプリ画面を保持する
- 同じデバッグセッション内で `選択のみ` を実行できる
- セッション終了時だけ teardown と resource close を行う
- 既存の `pytest tests/test_runner.py` 実行を壊さない

## 2. 現在の Framework 状況

2026-05-19 時点のローカル `D:/Script/E2EFramework` では、v2 の一部らしき実装が既に入っている。

確認済みの主なファイル:

- `src/core/execution/runner.py`
- `src/core/execution_context.py`
- `src/core/debug/debug_session.py`
- `src/core/debug/debug_server.py`
- `src/core/debug/models.py`
- `src/core/debug/log_buffer.py`
- `scripts/debug_server.py`
- `tests/conftest.py`
- `tests/test_runner.py`
- `src/core/scenario_loader.py`
- `src/utils/driver_factory.py`
- `src/utils/web_driver_factory.py`

ただし、実装が「動くはず」という状態に見えても、最新版コアに追従するには見直した方がよい点がある。

重要な観察点:

- `Runner.execute_step()` / `execute_steps()` は追加済み。
- `tests/conftest.py` には `--scenario-file`、`--scenario-id`、`--step-start` などが追加済み。
- `ScenarioLoader.load_scenarios()` は `file_path` とステップ範囲指定に対応済み。
- `src/core/debug/*` と `scripts/debug_server.py` は追加済み。
- `DriverFactory` は汎用 `_app` だけでなく Excel 専用 `_excel_app` / `_excel_window` も持つ。
- `DebugSession.close()` は `DriverFactory.close_all()` を呼んでおり、Excel も閉じる点は現在の Framework に合っている。
- `Context` は singleton で、`initialize_execution_context()` が `context.clear()` を呼ぶため、同一 Python プロセス内の複数セッション設計とは相性が悪い。Phase 1 は単一セッションに制限する。

## 3. 実装方針

### 3.1 pytest 実行経路とデバッグ実行経路を分ける

pytest は正式な通し実行、HTML レポート、CI 寄りの確認に残す。

デバッグセッションでは pytest を経由せず、常駐プロセス内で `Runner` を直接使う。

理由:

- pytest プロセスが終了すると `Context` と driver の状態が消える。
- `tests/conftest.py` の session teardown で app/browser が閉じる。
- Editor が必要としているのはテストレポートではなく、状態を保ったステップ実行である。

### 3.2 Framework 側 debug server は標準ライブラリ HTTP でよい

Phase 1 では FastAPI などの追加依存を入れない。

`http.server.ThreadingHTTPServer` と `BaseHTTPRequestHandler` で十分である。Editor は localhost HTTP で以下を呼べればよい。

- `GET /health`
- `POST /sessions`
- `GET /sessions/{id}`
- `GET /sessions/{id}/logs`
- `POST /sessions/{id}/run`
- `POST /sessions/{id}/next`
- `POST /sessions/{id}/cancel`
- `DELETE /sessions/{id}`
- `POST /shutdown`

### 3.3 Phase 1 は単一セッションだけ

`Context` が singleton、`DriverFactory` / `WebDriverFactory` が class variable を使っているため、同一プロセス内で複数セッションを安全に分離できない。

`DebugSessionManager` は active session を 1 つだけ持つ。active session がある状態で `POST /sessions` が来たら `409 Conflict` 相当のエラーにするのが望ましい。

## 4. 推奨ファイル構成

既に同名ファイルがある場合は、既存実装をこの方針に合わせて修正する。

```text
D:/Script/E2EFramework/
  scripts/
    debug_server.py
  src/
    core/
      execution_context.py
      execution/
        runner.py
      debug/
        __init__.py
        debug_session.py
        debug_server.py
        log_buffer.py
        models.py
```

既存 pytest 経路で触るファイル:

```text
tests/conftest.py
tests/test_runner.py
src/core/scenario_loader.py
src/core/execution/runner.py
```

## 5. 実装手順

### Step 1: Context 初期化を pytest から切り離す

`tests/conftest.py` に閉じていた初期化を `src/core/execution_context.py` に置く。

重要なのは、pytest と debug session で同じ config / screenshot dir の作り方を使うこと。

実装例:

```python
# src/core/execution_context.py
import logging
import os
from typing import Optional

from src.core.context import Context


def initialize_execution_context(
    env: str = "DEFAULT",
    run_folder: Optional[str] = None,
    base_reports: Optional[str] = None,
) -> Context:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    reports_root = base_reports or os.path.join(project_root, "reports", run_folder or "debug")
    screenshot_dir = os.path.join(reports_root, "screenshots")

    context = Context()
    context.clear()

    config_path = os.path.join(project_root, "config", "config.ini")
    context.load_config(config_path, env)
    context.set_variable("SCREENSHOTDIR", screenshot_dir)

    os.makedirs(reports_root, exist_ok=True)
    os.makedirs(screenshot_dir, exist_ok=True)
    return context


def add_file_logger(log_file: str, level: int = logging.DEBUG) -> logging.FileHandler:
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    handler = logging.FileHandler(log_file, encoding="utf-8")
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logging.getLogger().addHandler(handler)
    return handler
```

注意:

- `context.clear()` はセッション開始時だけ呼ぶ。
- ステップ実行ごとに初期化しない。
- `DebugSession` の lifetime 中は同じ `Context` を使い続ける。

### Step 2: Runner をステップ単位に分割する

`Runner.execute_scenario()` の中にある処理を `execute_steps()` と `execute_step()` に分ける。

要件:

- 既存 `execute_scenario(scenario)` は引き続き動く。
- デバッグ実行では `execute_step()` の戻り値を Editor に返せる。
- 失敗時にデバッグセッションを落とさないため、`raise_on_error=False` を選べる。
- pytest 通常実行では従来通り失敗を test failure にするため、`raise_on_error=True` を使う。

推奨インターフェース:

```python
class Runner:
    def execute_scenario(
        self,
        scenario: dict,
        section: str = "steps",
        include_teardown: bool = True,
    ):
        self.context.set_current_scenario(scenario)
        self.execute_steps(scenario, section=section, raise_on_error=True)

    def execute_steps(
        self,
        scenario: dict,
        section: str = "steps",
        start: int | None = None,
        end: int | None = None,
        raise_on_error: bool = False,
    ) -> list[dict]:
        ...

    def execute_step(
        self,
        step: dict,
        index: int | None = None,
        section: str = "steps",
        raise_on_error: bool = False,
    ) -> dict:
        ...
```

ステップ結果の形:

```json
{
  "section": "steps",
  "index": 1,
  "name": "テキストを入力",
  "status": "passed",
  "started_at": "2026-05-19T04:00:00+09:00",
  "ended_at": "2026-05-19T04:00:01+09:00",
  "duration_ms": 1000,
  "error": null
}
```

実装上の注意:

- `ignore: true` は `skipped` として返す。
- `condition` が false の場合も `skipped` として返す。
- `action_type` がない場合は `failed` にする。
- `params` の変数解決は既存 `_resolve_params()` を使う。
- `duration_ms` は Editor 側表示に有用なので追加推奨。
- `finally` で `ended_at` を必ず入れる。

例外処理の方針:

```python
except Exception as exc:
    result["status"] = "failed"
    result["error"] = {
        "type": type(exc).__name__,
        "message": str(exc),
        "traceback": traceback.format_exc(),
    }
    if raise_on_error:
        raise
    return result
```

### Step 3: ScenarioLoader は完全シナリオをロードできるようにする

pytest の部分実行では `ScenarioLoader` に `step_start` / `step_end` を渡してもよい。

しかし debug session では完全な scenario を保持する。

デバッグセッション開始時の呼び方:

```python
loader = ScenarioLoader(scenarios_dir)
scenarios = loader.load_scenarios(
    file_path=scenario_path,
    scenario_id=scenario_id,
)
scenario = scenarios[0]
```

禁止したい実装:

```python
# debug session では避ける
loader.load_scenarios(
    file_path=scenario_path,
    scenario_id=scenario_id,
    step_start=step_start,
    step_end=step_end,
)
```

理由:

- `ここまで` の後に別ステップを実行するため、全ステップ配列が必要。
- `current_index` と `history` を session 側で管理したい。
- `run_scenario` 展開後のステップ履歴を一貫して残したい。

### Step 4: DebugSession を作る

`DebugSession` は pytest から独立して、シナリオ、Context、Runner、現在位置、履歴、成果物を保持する。

推奨責務:

- scenario file と scenario id から scenario をロードする
- `initialize_execution_context()` で Context を作る
- `Runner(context)` を保持する
- `run_until` / `run_single` / `run_range` / `run_next` を提供する
- 失敗しても session を破棄しない
- close 時だけ teardown と resource close を行う
- `reports/debug_<session_id>/session.json` に状態を保存する

推奨インターフェース:

```python
class DebugSession:
    @classmethod
    def create(cls, scenario_path: str, scenario_id: str | None, env: str) -> "DebugSession":
        ...

    def run_until(self, section: str, step_end: int, rerun_executed: bool = False) -> dict:
        ...

    def run_single(self, section: str, step_index: int) -> dict:
        ...

    def run_range(self, section: str, step_start: int, step_end: int) -> dict:
        ...

    def run_next(self) -> dict:
        ...

    def cancel(self) -> dict:
        ...

    def close(self, run_teardown: bool = True, close_resources: bool = True) -> dict:
        ...

    def state(self) -> dict:
        ...
```

`run_until` の重要仕様:

```python
def run_until(self, section: str, step_end: int, rerun_executed: bool = False) -> dict:
    start = 0
    if not rerun_executed and section == self.current_section:
        start = self.current_index + 1
    if step_end < start:
        return self._record_result("passed", [])
    return self.run_range(section, start, step_end)
```

`run_single` は現在位置に関係なく対象ステップだけを実行する。

```python
def run_single(self, section: str, step_index: int) -> dict:
    return self.run_range(section, step_index, step_index)
```

`run_next` は現在位置の次を実行する。

```python
def run_next(self) -> dict:
    return self.run_single(self.current_section, self.current_index + 1)
```

`run_range` の注意点:

- 実行前に range validation を行う。
- `status` は `running` にする。
- 各 step の result を `history` に追加する。
- 成功した step だけ `current_index` を進める。
- failed の場合は `status = "failed"` にし、セッションは残す。
- failed の場合でも画面状態や driver は閉じない。

失敗時に `current_index` を進めるかは設計判断が必要だが、デバッグ用途では「失敗したステップ位置が現在位置」として表示したいので、失敗ステップの index に更新してよい。

### Step 5: リソース状態の取り方を最新 DriverFactory に合わせる

現在の `DriverFactory` は以下を持つ。

- 汎用 app: `DriverFactory._app`
- Excel app: `DriverFactory._excel_app`
- Excel window: `DriverFactory._excel_window`
- close all: `DriverFactory.close_all()`

`DebugSession.state()` の `resources` は、汎用 app と Excel と browser を分けると Editor 側で判断しやすい。

推奨:

```python
"resources": {
    "app_active": DriverFactory._app is not None,
    "excel_active": DriverFactory.is_excel_running(),
    "browser_active": WebDriverFactory.is_active(),
}
```

ただし `_app` への直接アクセスは内部実装依存なので、可能なら `DriverFactory.is_app_active()` を追加する。

追加例:

```python
@classmethod
def is_app_active(cls) -> bool:
    if cls._app is None:
        return False
    try:
        return cls._app.is_process_running()
    except Exception:
        return True
```

close 時は `DriverFactory.close_all()` を使う。

```python
if close_resources:
    if WebDriverFactory.is_active():
        WebDriverFactory.close_browser()
    DriverFactory.close_all()
```

### Step 6: debug server を作る

`src/core/debug/debug_server.py` に HTTP API を置く。

最小 API:

| Method | Path | 内容 |
| --- | --- | --- |
| `GET` | `/health` | 起動確認 |
| `POST` | `/sessions` | session 作成 |
| `GET` | `/sessions/{id}` | state 取得 |
| `GET` | `/sessions/{id}/logs?offset=0` | log buffer 取得 |
| `POST` | `/sessions/{id}/run` | range / single / until 実行 |
| `POST` | `/sessions/{id}/next` | 次 step 実行 |
| `POST` | `/sessions/{id}/cancel` | cancel flag |
| `DELETE` | `/sessions/{id}` | teardown / close |
| `POST` | `/shutdown` | server shutdown |

リクエスト例:

```json
{
  "scenario_path": "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json",
  "scenario_id": "SAMPLE-001",
  "env": "DEFAULT"
}
```

```json
{
  "mode": "until",
  "section": "steps",
  "step_end": 0,
  "rerun_executed": false
}
```

```json
{
  "mode": "single",
  "section": "steps",
  "step_start": 1
}
```

DELETE body:

```json
{
  "run_teardown": true,
  "close_resources": true
}
```

HTTP status の推奨:

- success: `200`
- session create: `201`
- validation error: `400`
- session not found: `404`
- active session already exists: `409`
- unexpected error: `500`

既存実装がすべて `400` に寄せている場合、Editor 側の実装を簡単にするためにも status を分けた方がよい。

### Step 7: 起動入口を作る

`scripts/debug_server.py` は Editor から `subprocess.Popen` される入口である。

要件:

- `PROJECT_ROOT` を `sys.path` に入れる。
- `--host` は default `127.0.0.1`。
- `--port 0` を許可する。
- 起動後、標準出力の 1 行目に JSON で port を出す。
- それ以外のログを 1 行目より前に stdout へ出さない。

実装例:

```python
host, port = server.server_address
print(json.dumps({"host": host, "port": port}), flush=True)
server.serve_forever()
```

Editor 側はこの 1 行目を読んで接続先 port を知るため、ここは壊さない。

## 6. 既存 pytest 経路の扱い

### 6.1 conftest.py

pytest には通常実行用の範囲指定があってもよい。

追加済みなら維持する:

- `--scenario-file`
- `--scenario-id`
- `--step-section`
- `--step-start`
- `--step-end`
- `--skip-teardown`

ただし、この pytest 範囲実行は debug session とは別物である。

用途:

- CLI から単一 JSON を確認する
- CI や回帰確認用に対象を絞る
- debug server なしで最終確認する

### 6.2 test_runner.py

`tests/test_runner.py` は薄いままでよい。

```python
def test_execute_scenario(scenario):
    context = Context()
    runner = Runner(context)
    control = scenario.get("_execution_control", {})
    runner.execute_scenario(
        scenario,
        section=control.get("section", "steps"),
        include_teardown=control.get("include_teardown", True),
    )
```

注意:

- `Context()` は singleton なので、pytest session fixture で初期化された context を参照する。
- debug session ではこのファイルを使わない。

## 7. 現在実装から直したいポイント

現在のローカル実装をベースにする場合、以下を優先して見直す。

### 7.1 `Runner.execute_scenario()` の `include_teardown`

現在の `Runner.execute_scenario()` は `include_teardown` を受け取っているが、実質的に `steps` しか実行していない。

方針を明確にする。

- pytest 通常実行で teardown を実行したいなら、`execute_scenario()` 内で `steps` 後に `teardown` を実行する。
- 既存仕様が「teardown は pytest fixture/resource close だけ」なら、引数名を残すだけでもよい。
- debug session の teardown は `DebugSession.close()` 側で実行するため、通常ステップの後には実行しない。

推奨:

```python
def execute_scenario(self, scenario, section="steps", include_teardown=True):
    self.context.set_current_scenario(scenario)
    if section == "steps":
        self.execute_steps(scenario, section="setup", raise_on_error=True)
        self.execute_steps(scenario, section="steps", raise_on_error=True)
        if include_teardown:
            self.execute_steps(scenario, section="teardown", raise_on_error=True)
    else:
        self.execute_steps(scenario, section=section, raise_on_error=True)
```

ただし既存シナリオに `setup` / `teardown` がない場合は空配列として扱う。

### 7.2 `DebugSession.close()` の logger handler cleanup

`DebugSession.close()` で file handler を外す処理は、handler が root logger に存在する場合だけ行う。

安全な実装:

```python
root_logger = logging.getLogger()
if self.file_handler in root_logger.handlers:
    root_logger.removeHandler(self.file_handler)
self.file_handler.close()
```

### 7.3 `/sessions/{id}/run` のレスポンス

現在実装では `_run()` の戻り値を捨てて `session.state()` だけ返している。

Editor からは `last_result` を見れば足りるが、API としては実行結果を明示した方が扱いやすい。

推奨レスポンス:

```json
{
  "session": { "...": "state" },
  "result": {
    "status": "passed",
    "steps": []
  }
}
```

### 7.4 `/sessions/{id}/next` の範囲外

`run_next()` は `current_index + 1` が存在しない場合に `ValueError` になる。

Editor で扱いやすいように、範囲外は `status: completed` または `passed` with empty steps にする。

例:

```python
def run_next(self) -> dict:
    steps = self.scenario.get(self.current_section, [])
    next_index = self.current_index + 1
    if next_index >= len(steps):
        self.status = "idle"
        return self._record_result("completed", [])
    return self.run_single(self.current_section, next_index)
```

### 7.5 `LogBuffer.entries()` の offset

現在の `deque(maxlen=capacity)` は古いログが捨てられるため、`offset` が絶対番号ではなく現在配列の index になっている。

Phase 1 では許容できるが、Editor 側 polling ではログ欠落や重複が起きる可能性がある。

改善案:

- `self.next_sequence` を持つ。
- 各 log entry に `seq` を付ける。
- `offset` は `seq` として扱う。

### 7.6 status 遷移

最低限、以下に揃える。

- `idle`
- `running`
- `failed`
- `cancelling`
- `closing`
- `closed`

`failed` 後に再実行を許可する場合、`run_range()` 開始時に `running` へ戻してよい。

## 8. 手動検証手順

### 8.1 debug server の起動確認

PowerShell:

```powershell
cd D:\Script\E2EFramework
python scripts/debug_server.py --host 127.0.0.1 --port 0 --env DEFAULT
```

期待:

- stdout の 1 行目に `{"host": "127.0.0.1", "port": 12345}` のような JSON が出る。
- プロセスは終了せず待機する。

別 PowerShell:

```powershell
$port = 12345
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:$port/health"
```

期待:

```json
{"status":"ok"}
```

### 8.2 セッション開始

```powershell
$body = @{
  scenario_path = "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json"
  scenario_id = "SAMPLE-001"
  env = "DEFAULT"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$port/sessions" -ContentType "application/json" -Body $body
```

期待:

- `session_id` が返る。
- `status` は `idle`。
- `current_index` は `-1`。
- `reports/debug_<session_id>/` が作られる。

### 8.3 ここまで

メモ帳サンプルの `steps[0]` が「メモ帳を起動」なら:

```powershell
$sid = "dbg_..."
$body = @{
  mode = "until"
  section = "steps"
  step_end = 0
  rerun_executed = $false
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$port/sessions/$sid/run" -ContentType "application/json" -Body $body
```

期待:

- メモ帳が起動したまま残る。
- `current_index` が `0` になる。
- `resources.app_active` が `true` になる。

### 8.4 選択のみ

`steps[1]` が「テキストを入力」なら:

```powershell
$body = @{
  mode = "single"
  section = "steps"
  step_start = 1
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$port/sessions/$sid/run" -ContentType "application/json" -Body $body
```

期待:

- 既に起動しているメモ帳に入力される。
- `Application not started` が出ない。
- セッションは `idle` に戻る。

### 8.5 終了

```powershell
$body = @{
  run_teardown = $true
  close_resources = $true
} | ConvertTo-Json

Invoke-RestMethod -Method DELETE -Uri "http://127.0.0.1:$port/sessions/$sid" -ContentType "application/json" -Body $body
```

期待:

- teardown があれば実行される。
- メモ帳や browser が閉じる。
- `status` が `closed` になる。
- `session.json` が保存される。

### 8.6 既存 pytest の回帰確認

```powershell
cd D:\Script\E2EFramework
pytest tests/test_runner.py --scenario-file "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json" --scenario-id "SAMPLE-001"
```

期待:

- 従来通り pytest として成功/失敗が返る。
- `reports/<run_id>/report.html` と `meta.json` の生成が壊れない。

## 9. コーディングエージェントへの依頼文例

Framework 側だけを直す場合は、次のように依頼するとよい。

```text
D:/Script/E2EFramework のみを対象に、Editor デバッグセッション用の Framework 側実装を修正してください。

目的:
- scripts/debug_server.py で常駐 HTTP debug server を起動できる
- POST /sessions で ScenarioLoader から完全な scenario をロードし、Context と Runner を保持する DebugSession を作る
- POST /sessions/{id}/run の until/single/range で同じ Context と DriverFactory/WebDriverFactory 状態を使ってステップ実行する
- DELETE /sessions/{id} で teardown と DriverFactory.close_all()/WebDriverFactory.close_browser() を行う
- 既存 pytest tests/test_runner.py の通常実行を壊さない

制約:
- Editor 側リポジトリは変更しない
- Phase 1 は同時セッション 1 件のみ
- debug server は 127.0.0.1 bind
- 追加依存は入れず、標準ライブラリ HTTP server でよい
- ステップ実行ロジックは Runner.execute_step()/execute_steps() に集約する
- debug session では ScenarioLoader の step_start/step_end を使わず、完全な scenario を保持する

検証:
- python scripts/debug_server.py --host 127.0.0.1 --port 0 --env DEFAULT
- /health
- SAMPLE-001_notepad.json で sessions 作成
- steps[0] まで until 実行後、メモ帳が閉じないこと
- steps[1] single 実行が同じメモ帳に対して成功すること
- DELETE /sessions/{id} でメモ帳が閉じること
- pytest tests/test_runner.py --scenario-file ... --scenario-id ... が従来通り動くこと
```

## 10. 受け入れ条件

E2EFramework 側の実装は、少なくとも以下を満たせば Editor 側へ引き継げる。

- `scripts/debug_server.py --port 0` が起動し、1 行目に host/port JSON を出す。
- `GET /health` が成功する。
- `POST /sessions` で session state が返る。
- active session がある状態で 2 つ目の session 作成を拒否する。
- `POST /sessions/{id}/run` の `until` が選択 step まで実行する。
- `POST /sessions/{id}/run` の `single` が同じ状態で対象 step だけ実行する。
- failed step でも session が破棄されない。
- `GET /sessions/{id}` で `current_section`、`current_index`、`history`、`last_error`、`resources` が取れる。
- `GET /sessions/{id}/logs` で debug server 起動後のログが取れる。
- `DELETE /sessions/{id}` で teardown と resource close が実行される。
- `DriverFactory.close_all()` と `WebDriverFactory.close_browser()` が close policy に従って呼ばれる。
- 既存 pytest 実行が壊れない。

## 11. 後続対応

Phase 1 ではやらないこと:

- 複数セッション対応
- 複数 app alias 対応
- pytest-html と同等の debug report 生成
- pywinauto / Selenium 実行中の即時キャンセル
- Editor UI のステップハイライト

後続で必要になる可能性が高い変更:

- `DriverFactory` / `WebDriverFactory` の alias 化
- `BasePage` の app alias 対応
- `run_scenario` 展開後 step と Editor 上 step の対応情報保持
- debug log の JSON Lines 化
- screenshot capture API
- debug session 簡易 HTML レポート

# テストシナリオ実行機能 実装計画

## 1. 目的

現在の E2E Test Scenario Editor は、E2EFramework 用 JSON シナリオの編集に特化している。
次の拡張では、エディタ画面からシナリオを実行し、開発中のシナリオをその場で検証できるようにする。

主な狙いは以下。

- 開いているシナリオを保存してから外部ターミナルで pytest を実行する手間を減らす
- 失敗箇所の調査を容易にするため、指定ステップまでの実行や 1 ステップ実行を可能にする
- 実行ログ、終了状態、レポートパスをエディタ上で確認できるようにする

## 2. 前提調査

### 2.1 エディタ側の現状

- バックエンドは FastAPI で、API は `src/backend/api.py` に集約されている。
- 設定は `config.json` を `src/backend/config.py` の `AppConfig` で読み書きしている。
- フロントエンドは Vanilla JS 構成で、`src/static/js/app.js` が各 UI コンポーネントを束ねている。
- タブ状態は `TabManager` が保持し、編集中データはタブごとの `tab.data` に入る。
- ステップ選択・複数選択・グループ表示は `ScenarioEditor` と `GroupManager` が担っている。
- 既に `ignore` によるステップ無効化、`_stepId` によるエディタ内部 ID、`_editor` による UI メタ情報が存在する。

### 2.2 E2EFramework 側の現状

- 設定例ではフレームワークが `D:/Script/E2EFramework` に配置されている。
- 実行入口は `pytest tests/test_runner.py`。
- `tests/conftest.py` が `scenarios` 配下の JSON を `ScenarioLoader` でロードし、pytest の `scenario` fixture としてパラメータ化している。
- `tests/test_runner.py` は `Runner.execute_scenario(scenario)` を呼ぶだけの薄い入口。
- `Runner.execute_scenario()` は現状 `scenario["steps"]` のみを順に実行している。
- 既存の絞り込みは `--tag` と pytest 標準の `-k "<scenario-id>"` が中心。
- E2EFramework 側には `docs/planning/scenario-execution-control.md` があり、`--dir` や `--ids` のような実行対象制御の拡張案が既にある。

### 2.3 重要な設計判断

エディタから直接 Python オブジェクトとして Runner を import して実行する方式ではなく、初期実装では別プロセスで pytest を起動する方式を採用する。

理由:

- 既存の pytest レポート、ログ、fixture、セッション終了処理をそのまま使える
- WebDriver や pywinauto などの実行資源をエディタの FastAPI プロセスから分離できる
- 実行のキャンセルを OS プロセス単位で扱いやすい
- E2EFramework 側の標準実行経路とのズレを小さくできる

## 3. 実現したい操作

### 3.1 通し実行

現在開いているシナリオを先頭から最後まで実行する。

- 対象はアクティブタブのシナリオ
- 未保存変更がある場合は保存を促す
- 実行中は再実行ボタンを無効化する
- 終了後に成功/失敗、ログ、HTML レポート、実行時間を表示する

### 3.2 指定箇所まで実行

選択中ステップ、またはユーザーが指定したステップ番号までを実行する。

- 主な用途は「ここまでの前提状態を作る」こと
- 初期実装では `steps` セクションを対象にする
- 将来拡張として `setup` / `teardown` の扱いを選択可能にする

### 3.3 1 ステップ実行

選択中の 1 ステップだけを実行する。

- そのステップの前提状態が必要な場合があるため、完全な単独実行はユーザー責任のデバッグ操作として扱う
- UI 上では「選択ステップのみ」と「先頭から選択ステップまで」を明確に分ける
- 初期実装では状態を保持した対話的デバッガではなく、毎回 pytest プロセスを起動する方式にする

### 3.4 ステップ実行

選択位置から 1 ステップずつ進める操作。

MVP では「次の 1 ステップのみを pytest で実行する」ではなく、「実行範囲を 1 ステップずつ更新して再実行する」方式から始める。
本当の逐次デバッグ、つまり同一ブラウザ・同一アプリ状態を保ったまま次ステップへ進める機能は、E2EFramework 側にデバッグセッション API が必要になるため Phase 2 以降に分離する。

## 4. 機能要件

### 4.1 設定

`config.json` に以下を追加する。

```json
{
  "framework_path": "D:/Script/E2EFramework",
  "execution_settings": {
    "python_executable": "",
    "default_env": "DEFAULT",
    "auto_save_before_run": true,
    "max_log_lines": 2000
  }
}
```

- `framework_path`: E2EFramework のルートディレクトリ
- `python_executable`: 空なら現在の Python、またはフレームワーク内の `.venv` 検出を試す
- `default_env`: pytest の `--env` に渡す値
- `auto_save_before_run`: 実行前にアクティブタブを保存するか
- `max_log_lines`: UI に保持する標準出力/標準エラーの上限

設定画面には「Framework Path」を追加し、既存のディレクトリ選択 API を再利用する。

### 4.2 実行 API

バックエンドに `src/backend/execution_service.py` を追加し、`api.py` に以下の API を追加する。

- `POST /api/executions`
  - 実行を開始する
  - 実行 ID を返す
- `GET /api/executions/{run_id}`
  - 実行状態、終了コード、開始/終了時刻、対象シナリオ、実行モードを返す
- `GET /api/executions/{run_id}/logs`
  - 標準出力/標準エラー、またはフレームワークのログ末尾を返す
- `POST /api/executions/{run_id}/cancel`
  - 実行中プロセスを停止する

実行開始リクエスト案:

```json
{
  "scenario_path": "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json",
  "scenario_id": "SAMPLE-001",
  "mode": "full",
  "section": "steps",
  "step_id": "stp_xxx",
  "step_index": 3,
  "env": "DEFAULT",
  "include_setup": true,
  "include_teardown": false
}
```

`mode` は以下。

- `full`: 通し実行
- `until`: 指定ステップまで実行
- `single`: 指定ステップだけ実行
- `range`: 指定範囲を実行

### 4.3 実行 UI

既存画面に「実行パネル」を追加する。

配置案:

- 上部ツールバーに実行系アイコンを追加
  - Run all
  - Run until selected
  - Run selected step
  - Stop
- 右ペインまたは下部ドロワーに実行結果パネルを追加
  - 実行状態
  - 実行対象
  - 経過時間
  - ログ
  - HTML レポートへのリンク
  - スクリーンショット/成果物ディレクトリへのパス

ステップ一覧では、実行対象範囲を視覚的に示す。

- 実行中ステップ: 強調表示
- 実行対象範囲: 薄い背景色
- 成功/失敗: アイコン表示

初期実装では pytest がステップ単位の結果を返さないため、ステップごとの成功/失敗表示はログ解析できる範囲に限定する。

### 4.4 実行前保存

実行対象はディスク上の JSON を pytest が読み込むため、未保存のタブをどう扱うかを明確にする。

MVP では以下。

- 未保存変更あり、かつ `auto_save_before_run=true`: 実行前に保存する
- 保存に失敗した場合は実行しない
- 外部変更競合がある場合は既存保存処理と同じ確認を出す
- 新規未保存ファイルの場合は「名前を付けて保存」が完了するまで実行できない

将来案として、一時ファイルに保存して実行する方式も検討できる。
ただしフレームワークの `ScenarioLoader` が `scenarios` 配下を走査する構造のため、初期実装では通常保存を優先する。

## 5. E2EFramework 側に必要な拡張

エディタだけの変更では、任意ファイル・任意ステップ範囲の実行が安定して実現できない。
E2EFramework 側に以下の最小拡張を入れる。

### 5.1 pytest オプション追加

`tests/conftest.py` に追加するオプション案。

- `--scenario-file <path>`
  - 指定した JSON ファイルのみを実行対象にする
- `--scenario-id <id>`
  - ファイル内に複数シナリオがある場合の対象 ID
- `--step-section <setup|steps|teardown>`
  - 実行範囲の対象セクション
- `--step-start <number>`
  - 0 始まりの開始インデックス
- `--step-end <number>`
  - 0 始まりの終了インデックス、含む
- `--skip-teardown`
  - デバッグ実行で teardown を省略したい場合に使う

コマンド例:

```powershell
pytest tests/test_runner.py --scenario-file "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json" --scenario-id "SAMPLE-001"
pytest tests/test_runner.py --scenario-file "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json" --step-start 0 --step-end 3
pytest tests/test_runner.py --scenario-file "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json" --step-start 3 --step-end 3 --skip-teardown
```

### 5.2 ScenarioLoader 拡張

`ScenarioLoader` に単一ファイルロードと ID フィルタを追加する。

- `load_scenarios(file_path=None, scenario_id=None, tag_filter=None)`
- `file_path` 指定時はディレクトリ再帰走査を行わない
- 共有シナリオ展開は既存通り行う

### 5.3 Runner 拡張

`Runner.execute_scenario()` に実行範囲オプションを渡せるようにする。

案:

```python
runner.execute_scenario(
    scenario,
    section="steps",
    step_start=None,
    step_end=None,
    include_setup=True,
    include_teardown=True,
)
```

注意点:

- 現状 Runner は `steps` のみを実行しているため、`setup` / `teardown` をどう扱うかは別途仕様化が必要。
- `ignore: true` の扱いはフレームワーク側の既存仕様に合わせる。もし未対応なら `Runner` 側で skip する。
- 共有シナリオ展開後のステップ番号と、エディタ上の元 JSON ステップ番号がズレる可能性がある。MVP では元ファイルの `steps` 範囲を切ってから共有展開する方式を優先する。

## 6. 実装フェーズ

### Phase 0: 詳細仕様の確定

- `setup` / `teardown` を部分実行に含める条件を決める
- 1 ステップ実行を「単独実行」として扱うか、「先頭からそこまで実行して最後だけ注目」とするかを UI 上で分ける
- 実行中に別タブへ移動した場合の表示ルールを決める
- 複数実行を許可するか、同時実行 1 件に制限するかを決める

推奨: 初期実装は同時実行 1 件に制限する。

### Phase 1: フレームワーク側の最小実行範囲制御

対象リポジトリ: `D:/Script/E2EFramework`

変更候補:

- `tests/conftest.py`
- `src/core/scenario_loader.py`
- `src/core/execution/runner.py`
- 必要に応じて `tests/test_runner.py`

受け入れ条件:

- `--scenario-file` で単一 JSON だけ実行できる
- `--step-start` / `--step-end` で範囲実行できる
- 既存の `pytest tests/test_runner.py` の挙動を壊さない
- 既存の `--tag` / `-k` の利用に影響しない

### Phase 2: エディタ設定の拡張

対象:

- `src/backend/config.py`
- `src/backend/api.py`
- `src/static/js/ui/modal.js`
- `src/static/js/app.js`

内容:

- `framework_path` と `execution_settings` を `AppConfig` に追加
- 設定モーダルに Framework Path を追加
- パス未設定時は実行ボタンを disabled にする
- 起動時に `framework_path` が存在するか検証する API を追加する

### Phase 3: 実行サービス/API

対象:

- `src/backend/execution_service.py`
- `src/backend/api.py`
- `src/static/js/api.js`

内容:

- `subprocess.Popen` で pytest を非同期起動する
- 実行 ID ごとに状態をメモリ管理する
- 標準出力/標準エラーを逐次収集する
- 実行キャンセルを実装する
- フレームワーク配下の `reports/<RunID>/meta.json` を検出し、レポート情報を API レスポンスへ含める

実装上の注意:

- `cwd` は必ず `framework_path` にする
- コマンド引数は文字列連結ではなくリストで組み立てる
- `framework_path` 外の任意コマンドを実行できないようにする
- Windows での停止は子プロセスも含めた停止を検討する

### Phase 4: 実行 UI

対象:

- `src/static/index.html`
- `src/static/css/style.css`
- `src/static/css/components.css`
- `src/static/js/app.js`
- 新規 `src/static/js/ui/execution_panel.js`

内容:

- ツールバーに実行ボタンを追加
- 選択中ステップに応じて `until` / `single` 実行の有効状態を切り替える
- 実行パネルでログと結果を表示する
- 実行中はポーリングで `GET /api/executions/{run_id}` と logs を取得する
- Stop ボタンから cancel API を呼ぶ

### Phase 5: ステップ範囲解決

対象:

- `src/static/js/ui/scenario_editor.js`
- 必要に応じて `GroupManager`

内容:

- 選択中の `_stepId` から section と index を解決する API を `ScenarioEditor` に追加する
- グループ内ステップでも元の `steps` 配列上の index を取得できるようにする
- 複数選択時は範囲実行の開始・終了を決める

推奨ルール:

- 単一選択: `until` は 0 から選択 index、`single` は選択 index のみ
- 複数選択: `range` は選択された最小 index から最大 index
- 異なる section をまたぐ複数選択では範囲実行を無効にする

### Phase 6: 品質向上

- 実行履歴の保持
- 前回失敗したシナリオの再実行
- ログ内の失敗ステップ名をクリックして該当ステップへジャンプ
- HTML レポートをエディタ内 iframe で開くか、外部ブラウザで開くかを選べるようにする
- 実行結果をステップ単位で保持するため、フレームワーク側のログ形式を JSON Lines 化する

## 7. データモデル案

### 7.1 実行状態

```json
{
  "run_id": "run_20260518_123456_abc",
  "status": "running",
  "mode": "until",
  "scenario_path": "D:/Script/E2EFramework/scenarios/sample/SAMPLE-001_notepad.json",
  "scenario_id": "SAMPLE-001",
  "section": "steps",
  "step_start": 0,
  "step_end": 3,
  "command": ["pytest", "tests/test_runner.py", "--scenario-file", "..."],
  "started_at": "2026-05-18T12:34:56+09:00",
  "ended_at": null,
  "exit_code": null,
  "artifacts": {
    "report": "D:/Script/E2EFramework/reports/Run_xxx/report.html",
    "log": "D:/Script/E2EFramework/reports/Run_xxx/run_Run_xxx.log",
    "meta": "D:/Script/E2EFramework/reports/Run_xxx/meta.json"
  }
}
```

### 7.2 実行履歴

MVP はメモリ保持でよい。
将来は `config.json` ではなく、別ファイル `execution_history.json` を用意する。

## 8. エラーハンドリング

- Framework Path 未設定: 実行ボタン disabled、設定への導線を表示
- Framework Path 不正: API は 400、UI は設定確認メッセージを表示
- pytest 起動失敗: `failed_to_start` として記録し、stderr を表示
- 実行中キャンセル: `cancelled` として記録する
- 実行タイムアウト: 初期実装ではタイムアウトなし、将来設定化
- 未保存ファイル: 保存完了まで実行不可
- 外部変更競合: 既存の保存競合フローを使う

## 9. セキュリティ・安全性

このツールはローカル専用だが、実行機能は任意コマンド実行に近いリスクを持つ。
以下を必須にする。

- 実行できるコマンドは pytest に固定する
- `cwd` は設定済み `framework_path` に固定する
- `framework_path` は存在するディレクトリで、`tests/test_runner.py` と `pytest.ini` があることを検証する
- シナリオパスは設定済み `scenario_directories` または `shared_scenario_dir` 配下に限定する
- API リクエストから任意のコマンドライン引数を直接渡せないようにする
- ログ表示は HTML として挿入せず、テキストとして描画する

## 10. テスト計画

### 10.1 バックエンド

- 設定ロード/保存で既存 config と互換性がある
- 不正な Framework Path を拒否する
- 実行コマンドが期待通りの引数リストになる
- 実行開始、状態取得、ログ取得、キャンセルが動作する
- シナリオパスの許可範囲外を拒否する

### 10.2 フロントエンド

- 未選択時は範囲実行ボタンが disabled
- 単一ステップ選択時に until/single の index が正しく解決される
- グループ内ステップでも index が正しく解決される
- 未保存タブでは保存後に実行される
- 実行中に Stop が押せる
- ログが増えても UI が破綻しない

### 10.3 結合

- 通し実行で `reports/<RunID>/report.html` が生成される
- 指定ステップまでの実行で対象外ステップが実行されない
- 選択ステップのみの実行で対象ステップだけが実行される
- 失敗時に exit code とログが UI に表示される
- 既存の編集・保存・タブ復元に影響しない

## 11. リスクと対応

### 11.1 共有シナリオ展開後のステップ番号ズレ

`run_scenario` により共有シナリオが展開されると、エディタ上の 1 ステップが実行時には複数ステップになる。
MVP では元シナリオのステップ範囲を先に絞り、その後に共有シナリオ展開することで、UI の選択と実行対象の対応を保つ。

### 11.2 本当の 1 ステップデバッグではない

pytest を毎回起動する方式では、前のステップで作ったブラウザ・アプリ状態を保持したまま次へ進むことは難しい。
このため、初期実装の「1 ステップ実行」は独立したデバッグ実行として明示する。
状態を保持するステップ実行は、E2EFramework 側にデバッグセッション管理を追加する別フェーズとする。

### 11.3 実行プロセスの停止

Windows では pytest の子プロセスとしてブラウザやアプリが残る可能性がある。
キャンセル時はプロセスグループ単位での停止、またはフレームワーク側の teardown/cleanup 呼び出しを検討する。

### 11.4 UI とレポートの同期

pytest-html のレポートパスは `conftest.py` 内で実行ごとに決まる。
エディタ側は実行後に `reports` 配下の最新 run、または `meta.json` を参照して成果物を特定する。
より確実にするには、E2EFramework 側に `--run-id` オプションを追加してエディタから run id を渡す。

## 12. 推奨 MVP

最初に作る範囲は以下に絞る。

1. E2EFramework 側に `--scenario-file`, `--step-start`, `--step-end` を追加する
2. エディタ設定に `framework_path` を追加する
3. エディタからアクティブタブの通し実行を開始できる
4. 選択ステップまで実行できる
5. 選択ステップのみ実行できる
6. 実行中止、ログ表示、成功/失敗表示、レポートパス表示を実装する

本当の逐次デバッグ、実行履歴、ステップ単位の詳細結果表示は MVP 後に回す。

## 13. 参考

- E2EFramework repository: https://github.com/y24/E2EFramework
- ローカル確認対象: `D:/Script/E2EFramework/tests/conftest.py`
- ローカル確認対象: `D:/Script/E2EFramework/tests/test_runner.py`
- ローカル確認対象: `D:/Script/E2EFramework/src/core/scenario_loader.py`
- ローカル確認対象: `D:/Script/E2EFramework/src/core/execution/runner.py`
- ローカル確認対象: `D:/Script/E2EFramework/docs/knowledge/pytest-command-samples.md`
- ローカル確認対象: `D:/Script/E2EFramework/docs/planning/scenario-execution-control.md`

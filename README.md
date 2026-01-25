# E2E Test Scenario Editor

E2Eテストシナリオ(JSON形式)を視覚的に編集するためのWebベースのエディタです。

## 概要

このツールは、E2Eテストフレームワークで使用するJSONシナリオファイルを、ブラウザ上で直感的に編集できるようにします。

### 主な機能

- **ファイルブラウザ**: シナリオディレクトリ内のファイルをツリー表示
- **タブ管理**: 複数のシナリオファイルを同時に編集
- **ドラッグ&ドロップ**: ステップの並び替えが簡単
- **プロパティエディタ**: ステップの詳細設定を右パネルで編集
- **JSON構造保持**: 未知のキーや構造を破壊せずに保存
- **リサイズ可能なパネル**: 作業しやすいレイアウトにカスタマイズ可能

## 技術スタック

- **Backend**: FastAPI + Uvicorn (Python 3.10+)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **ライブラリ**: SortableJS (ドラッグ&ドロップ), Ionicons (アイコン)

## 必要な環境

- Python 3.10 以上
- pip (Pythonパッケージマネージャー)
- モダンなWebブラウザ (Chrome, Firefox, Edge など)

## セットアップと起動手順

### 1. 依存関係のインストール

プロジェクトのルートディレクトリで以下のコマンドを実行します:

```powershell
pip install -r requirements.txt
```

インストールされるパッケージ:
- `fastapi>=0.100.0` - Webフレームワーク
- `uvicorn>=0.20.0` - ASGIサーバー
- `pydantic>=2.0.0` - データバリデーション
- `aiofiles>=23.0.0` - 非同期ファイルI/O

### 2. サーバーの起動

以下のいずれかの方法でサーバーを起動します:

#### 方法A: Uvicornコマンドで起動 (推奨)

```powershell
uvicorn src.backend.main:app --reload --host 127.0.0.1 --port 8000
```

オプション説明:
- `--reload`: ファイル変更時に自動リロード (開発時に便利)
- `--host 127.0.0.1`: ローカルホストでのみアクセス可能
- `--port 8000`: ポート番号 (デフォルト: 8000)

#### 方法B: Pythonモジュールとして起動

```powershell
python -m src.backend.main
```

### 3. ブラウザでアクセス

サーバーが起動したら、ブラウザで以下のURLにアクセスします:

```
http://127.0.0.1:8000
```

### 4. 初回設定

初回起動時には設定ダイアログが表示されます:

1. **Scenarios Directory**: メインのシナリオファイルが格納されているディレクトリパスを指定
   - 例: `d:/Script/E2ETestScenarioEditor/scenarios`
2. **Shared Scenarios Directory** (オプション): 共有シナリオのディレクトリパス
   - 不要な場合は空欄のまま

設定は `config.json` に保存されます。

## 使い方

### ファイルの読み込み

1. 左パネルのファイルブラウザからシナリオファイルをクリック
2. ファイルがタブとして開かれ、中央パネルにステップが表示されます

### ステップの編集

1. 中央パネルでステップをクリックして選択
2. 右パネルのプロパティエディタで詳細を編集
3. ステップをドラッグ&ドロップで並び替え可能

### ファイルの保存

- **保存**: 上部ツールバーの保存ボタンをクリック、または `Ctrl+S`
- **名前を付けて保存**: 新規ファイルの場合、保存時にダイアログが表示されます

### 新規ファイルの作成

上部ツールバーの「New File」ボタンをクリックすると、空のシナリオが作成されます。

## ディレクトリ構成

```
E2ETestScenarioEditor/
├── src/
│   ├── backend/           # FastAPIバックエンド
│   │   ├── main.py        # エントリーポイント
│   │   ├── api.py         # APIエンドポイント
│   │   ├── file_service.py # ファイル操作ロジック
│   │   └── config.py      # 設定管理
│   └── static/            # フロントエンドアセット
│       ├── index.html     # メインHTML
│       ├── css/           # スタイルシート
│       └── js/            # JavaScriptモジュール
├── scenarios/             # シナリオファイル格納場所
├── docs/                  # ドキュメント
├── config.json            # アプリケーション設定
├── requirements.txt       # Python依存関係
└── README.md              # このファイル
```

## トラブルシューティング

### サーバーが起動しない

- Pythonのバージョンを確認: `python --version` (3.10以上が必要)
- 依存関係が正しくインストールされているか確認: `pip list`
- ポート8000が既に使用されている場合は、別のポートを指定:
  ```powershell
  uvicorn src.backend.main:app --reload --port 8001
  ```

### ファイルが表示されない

- `config.json` のパスが正しいか確認
- 指定したディレクトリにJSONファイルが存在するか確認
- ブラウザのコンソール (F12) でエラーメッセージを確認

### 保存できない

- ファイルパスに書き込み権限があるか確認
- ファイル名に使用できない文字が含まれていないか確認
- ブラウザのコンソールでエラーメッセージを確認

## 開発者向け情報

### 開発モードでの起動

```powershell
uvicorn src.backend.main:app --reload --log-level debug
```

### APIエンドポイント

- `GET /api/config` - 設定の取得
- `POST /api/config` - 設定の保存
- `GET /api/files` - ファイル一覧の取得
- `GET /api/scenarios/{path}` - シナリオの読み込み
- `POST /api/scenarios/{path}` - シナリオの保存

詳細は `src/backend/api.py` を参照してください。

## ライセンス

(プロジェクトのライセンス情報をここに記載)

## 貢献

(コントリビューションガイドラインをここに記載)

# 実装計画書: E2EFramework シナリオ編集ツール

本ドキュメントは、`docs/requirements.md` に基づいた実装計画を定義します。

## 1. アーキテクチャ概要

### 1.1 技術スタック
*   **Backend**: Python 3.10+
    *   **Framework**: FastAPI (軽量、高速、型安全性)
    *   **Server**: Uvicorn (非同期サーバー)
    *   **役割**: 静的ファイル配信、ローカルファイルシステム操作(JSON読み書き)、設定管理
*   **Frontend**: Standard Web Technologies
    *   **HTML5 / CSS3**: Vanilla CSS (CSS Variables, Flexbox/Grid) でリッチなデザインを構築
    *   **JavaScript**: Vanilla ES6+ (Modules)。フレームワークなしで軽量に実装
    *   **Libraries**:
        *   `SortableJS` (推奨): ドラッグ＆ドロップによる並び替えのため (CDNまたはローカル配置)
        *   `Toastify` or similar: 通知表示用 (軽量なもの)
        *   Ionicons / FontAwesome: アイコン用

### 1.2 ディレクトリ構成案
```
root/
  ├── src/
  │   ├── backend/
  │   │   ├── main.py          # エントリーポイント (FastAPI App)
  │   │   ├── api.py           # APIエンドポイント定義
  │   │   ├── file_service.py  # JSON読み書き、構造保持ロジック
  │   │   └── config.py        # 設定管理
  │   └── static/              # フロントエンドアセット
  │       ├── index.html
  │       ├── css/
  │       │   ├── style.css    # グローバルスタイル
  │       │   ├── components.css
  │       │   └── theme.css    # カラーパレット、変数
  │       └── js/
  │           ├── app.js       # メインロジック
  │           ├── api.js       # APIクライアント
  │           ├── ui/          # UIコンポーネント管理
  │           ├── state.js     # 状態管理 (Store)
  │           └── utils.js
  ├── docs/
  ├── scenarios/ (デモ用)
  ├── pyproject.toml
  └── README.md
```

## 2. 実装フェーズ

### Phase 1: プロジェクトセットアップと基盤構築
**目標**: サーバーが起動し、ブラウザで画面が表示されること。
1.  Pythonプロジェクト作成 (`pyproject.toml`)
2.  FastAPI + Uvicorn セットアップ
3.  静的ファイル配信 (`src/static`) の設定
4.  基本的なCSS変数の定義 (カラーパレット、フォント) - **モダンで美しいUIの基盤**

### Phase 2: バックエンド実装 (ファイル操作・JSON保持)
**目標**: JSONファイルの読み書きができること。特に「未知のキーや構造」を破壊せずに保存できること。
1.  **カスタムJSONハンドラー実装 (`file_service.py`)**
    *   `json` モジュール または `commentjson` 等を検討し、順序保持(`OrderedDict`)とラウンドトリップ性を担保。
    *   要件 `D-001`, `D-095` (キー順序固定) の実装。
2.  **API実装 (`api.py`)**
    *   `GET /api/config`: 設定取得
    *   `POST /api/config`: 設定保存
    *   `GET /api/files`: ディレクトリ走査・ファイル一覧取得
    *   `GET /api/scenarios/{path}`: シナリオ読み込み
    *   `POST /api/scenarios/{path}`: シナリオ保存

### Phase 3: フロントエンド - レイアウトとファイル操作
**目標**: ファイル一覧が表示され、選択したファイルを読み込んで表示できること。
1.  **3ペインレイアウト実装** (ファイル一覧 / エディタ(タブ) / 詳細プロパティ)
2.  **設定画面 (初回起動フロー)**
    *   `scenarios` / `scenarios_shared` フォルダパスの設定UI
3.  **ファイルブラウザ機能**
    *   APIから取得したツリーの表示
    *   ファイルクリックでのロード処理

### Phase 4: フロントエンド - シナリオ編集コア (タブ・ツリー)
**目標**: ステップが表示され、タブ切り替えができること。
1.  **タブ管理システム**
    *   複数ファイルオープンの状態管理
    *   未保存フラグの管理
2.  **ステップリスト表示 (左ペイン)**
    *   Setup / Steps / Teardown のセクション分け
    *   ステップ名の表示
    *   **SortableJS** を使用したドラッグ＆ドロップ並び替えの実装
3.  **プロパティエディタ (右ペイン)**
    *   選択したステップの `name`, `type`, `params` 編集フォーム
    *   動的なKey-Value編集UI (未知のパラメータ対応)

### Phase 5: 高度な編集機能 (グループ化・コピー＆ペースト)
**目標**: 要件の「グループ化」「無効化」「コピペ」を実装すること。
1.  **グループ化機能 (`_editor` メタデータ対応)**
    *   UI上でのグループ作成・解除
    *   グループ内へのD&D
    *   保存時の JSON 構造変換 (フラット化 + `layout` 情報保存)
2.  **クリップボード操作**
    *   複数ステップのJSON形式コピー
    *   貼り付け時の `_stepId` 再採番ロジック (`F-058`)
3.  **無効化 (Ignore) 機能**
    *   UIでのグレーアウト表現

### Phase 6: ポリッシュと品質向上
**目標**: 快適な操作性とエラーハンドリング。
1.  **バリデーションとエラー表示**
    *   保存失敗時のトースト通知
    *   不正なJSON入力のガード
2.  **UI/UX改善**
    *   ホバーエフェクト、トランジションの調整
    *   ダークモード/ライトモードの更なる洗練
3.  **自動修復機能 (G-100)**
    *   読み込み時の整合性チェックと修復

## 3. マイルストーン
*   **Day 1**: Phase 1 & 2 (Backend Core)
*   **Day 2**: Phase 3 (Basic UI & File IO)
*   **Day 3**: Phase 4 (Tab & Step Editing)
*   **Day 4**: Phase 5 (Advanced Features)
*   **Day 5**: Phase 6 (Polish)

## 4. 懸念点・リスク
*   **JSONのコメント保持**: 標準的なJSONパーサーはコメントを削除する。要件には明記されていないが、テストシナリオでコメントを使う運用がある場合は考慮が必要。(現状は要件に含まれないため、標準JSONとして扱う)
*   **大規模ファイルのパフォーマンス**: 数百ステップ時のレンダリング性能。必要に応じて仮想スクロール導入を検討する。

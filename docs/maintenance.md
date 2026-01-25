# メンテナンスガイド

このドキュメントでは、E2E Test Scenario Editorのメンテナンス方法について説明します。

## 目次

1. [Type（ステップタイプ）の定義変更](#typeステップタイプの定義変更)
2. [Params（パラメータ）の定義変更](#paramsパラメータの定義変更)
3. [アイコンの定義変更](#アイコンの定義変更)

---

## Type（ステップタイプ）の定義変更

ステップタイプ（system, ui, web, excel, verify, debugなど）やそれに紐づくアクション/オペレーションを追加・変更する場合の手順です。

### 編集対象ファイル

**`src/static/js/ui/actions.json`**

### ファイル構造

```json
{
    "タイプ名": {
        "action": [アクションのリスト],
        "operation": [オペレーションのリスト],
        "type": [タイプのリスト]
    }
}
```

### 編集方法

#### 1. 新しいタイプを追加する場合

```json
{
    "system": { ... },
    "ui": { ... },
    "新しいタイプ名": {
        "action": [
            "アクション1",
            "アクション2"
        ]
    }
}
```

#### 2. 既存タイプにアクション/オペレーションを追加する場合

例：`system`タイプに新しいアクション`new_action`を追加

```json
{
    "system": {
        "action": [
            "sleep",
            "command",
            "print",
            "start_app",
            "set_variables",
            "new_action"  // ← 追加
        ]
    }
}
```

#### 3. アクション/オペレーションを削除する場合

該当する配列から削除したい項目を削除してください。

### 注意事項

- `action`, `operation`, `type`のキー名は、タイプによって異なります
  - `system`, `excel`, `debug`: `action`
  - `ui`, `web`: `operation`
  - `verify`: `type`
- JSONの構文エラーに注意してください（最後の要素にカンマを付けない、など）

---

## Params（パラメータ）の定義変更

各ステップタイプで使用可能なパラメータ名や、パラメータの選択肢を追加・変更する場合の手順です。

### 編集対象ファイル

**`src/static/config/action_params.json`**

### ファイル構造

```json
{
    "タイプ名": {
        "paramNames": [利用可能なパラメータ名のリスト],
        "paramValues": {
            "パラメータ名": [選択肢のリスト]
        }
    }
}
```

### 編集方法

#### 1. 新しいパラメータ名を追加する場合

例：`ui`タイプに`timeout`パラメータを追加

```json
{
    "ui": {
        "paramNames": [
            "operation",
            "target",
            "value",
            "regex",
            "save_as",
            "timeout"  // ← 追加
        ],
        "paramValues": {
            "operation": [...]
        }
    }
}
```

#### 2. パラメータの選択肢を追加する場合

例：`web`の`browser`パラメータに`safari`を追加

```json
{
    "web": {
        "paramNames": [...],
        "paramValues": {
            "browser": [
                "chrome",
                "firefox",
                "edge",
                "safari"  // ← 追加
            ]
        }
    }
}
```

#### 3. 新しいタイプのパラメータ定義を追加する場合

```json
{
    "system": { ... },
    "ui": { ... },
    "新しいタイプ名": {
        "paramNames": [
            "param1",
            "param2"
        ],
        "paramValues": {
            "param1": [
                "value1",
                "value2"
            ]
        }
    }
}
```

### 注意事項

- `paramNames`に追加したパラメータは、プロパティパネルで入力可能になります
- `paramValues`に定義されたパラメータは、ドロップダウンで選択可能になります
- `paramValues`に定義されていないパラメータは、テキスト入力フィールドとして表示されます
- `actions.json`で定義したタイプと対応させる必要があります

---

## アイコンの定義変更

各ステップタイプやアクション/オペレーションに表示されるアイコンを変更する場合の手順です。

### 編集対象ファイル

**`src/static/js/ui/icons.json`**

### ファイル構造

```json
{
    "types": {
        "タイプ名": "アイコン名"
    },
    "operations": {
        "アクション/オペレーション名": "アイコン名"
    },
    "default": "デフォルトアイコン名"
}
```

### 使用可能なアイコン

このプロジェクトでは、**Ionicons**を使用しています。

- 公式サイト: https://ionic.io/ionicons
- 利用可能なアイコン一覧: https://ionic.io/ionicons で検索可能
- アイコン名は、`-outline`サフィックスを付けることを推奨（例：`cog-outline`）

### 編集方法

#### 1. タイプのアイコンを変更する場合

例：`system`タイプのアイコンを`settings-outline`に変更

```json
{
    "types": {
        "system": "settings-outline",  // ← 変更
        "ui": "browsers-outline",
        ...
    }
}
```

#### 2. アクション/オペレーションのアイコンを変更する場合

例：`click`のアイコンを`hand-left-outline`に変更

```json
{
    "operations": {
        "click": "hand-left-outline",  // ← 変更
        "input": "create-outline",
        ...
    }
}
```

#### 3. 新しいタイプのアイコンを追加する場合

```json
{
    "types": {
        "system": "cog-outline",
        ...
        "新しいタイプ名": "新しいアイコン名"  // ← 追加
    }
}
```

#### 4. 新しいアクション/オペレーションのアイコンを追加する場合

```json
{
    "operations": {
        "click": "navigate-outline",
        ...
        "新しいアクション名": "新しいアイコン名"  // ← 追加
    }
}
```

#### 5. デフォルトアイコンを変更する場合

定義されていないタイプやアクションに使用されるアイコンを変更できます。

```json
{
    "types": { ... },
    "operations": { ... },
    "default": "cube-outline"  // ← 変更
}
```

### 注意事項

- アイコン名は、Ioniconsで提供されている正確な名前を使用してください
- 存在しないアイコン名を指定すると、アイコンが表示されません
- `types`と`operations`の両方に定義がある場合、`operations`が優先されます
- アイコンが定義されていない場合、`default`で指定されたアイコンが使用されます

---

## メンテナンス時の確認事項

### 1. 整合性の確認

3つのファイルを変更する際は、以下の整合性を保つ必要があります：

- `actions.json`で定義したタイプ → `action_params.json`でパラメータを定義
- `actions.json`で定義したタイプ → `icons.json`でアイコンを定義
- `actions.json`で定義したアクション/オペレーション → `icons.json`でアイコンを定義（任意）

### 2. JSON構文の確認

- 各ファイルを編集後、JSON構文が正しいか確認してください
- オンラインツール（https://jsonlint.com/ など）で検証可能です
- ブラウザの開発者ツールのコンソールでエラーが出ていないか確認してください

### 3. ブラウザのキャッシュクリア

- ファイルを変更した後、ブラウザのキャッシュをクリアするか、スーパーリロード（Ctrl+Shift+R / Cmd+Shift+R）を実行してください

### 4. 動作確認

変更後は以下を確認してください：

1. ステップタイプのドロップダウンに新しいタイプが表示されるか
2. アクション/オペレーションのドロップダウンに新しい項目が表示されるか
3. パラメータパネルに新しいパラメータが表示されるか
4. アイコンが正しく表示されるか
5. 既存のシナリオが正常に読み込めるか

---

## トラブルシューティング

### アイコンが表示されない

- アイコン名が正しいか確認してください（Ioniconsの公式サイトで検索）
- ブラウザの開発者ツールのコンソールでエラーが出ていないか確認してください

### パラメータが表示されない

- `action_params.json`の`paramNames`に追加されているか確認してください
- JSON構文エラーがないか確認してください

### ドロップダウンに選択肢が表示されない

- `action_params.json`の`paramValues`に定義されているか確認してください
- タイプ名とパラメータ名が正しいか確認してください

### 変更が反映されない

- ブラウザのキャッシュをクリアしてください
- サーバーを再起動してください（`uvicorn`を再起動）
- ファイルが正しく保存されているか確認してください

---

## 参考情報

### 関連ファイル

- **`src/static/js/ui/scenario_editor.js`**: ステップエディタのメインロジック
- **`src/static/js/ui/properties_panel.js`**: プロパティパネルの実装
- **`src/static/index.html`**: Ioniconsの読み込み

### 外部リソース

- [Ionicons公式サイト](https://ionic.io/ionicons)
- [JSON Lint（JSON検証ツール）](https://jsonlint.com/)

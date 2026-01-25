import json
import aiofiles
from collections import OrderedDict
from typing import Any, Dict
import os

class FileService:
    # 保存時のキー順序定義
    ORDER_PRIORITY = [
        "id",
        "name",
        "tags",
        "description",
        "setup",
        "steps",
        "teardown"
    ]
    EDITOR_KEY = "_editor"

    @staticmethod
    async def load_json(path: str) -> Dict[str, Any]:
        """
        JSONファイルを読み込む。順序を保持するためにOrderedDictを使用するが、
        Python 3.7+のdictも順序保持するため、標準のjson.loadで十分。
        ただし、念のためobject_pairs_hookを指定して明示的に扱うことも可能だが、
        ここでは標準のdict(順序保持)に任せる。
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"File not found: {path}")
            
        async with aiofiles.open(path, mode='r', encoding='utf-8') as f:
            content = await f.read()
            # コメント付きJSON等の対応が必要な場合はここで調整するが、
            # 要件では標準JSON。
            return json.loads(content, object_pairs_hook=OrderedDict)

    @staticmethod
    async def save_json(path: str, data: Dict[str, Any], indent: int = 2) -> None:
        """
        JSONファイルを保存する。
        要件に基づき、トップレベルのキー順序を整理して保存する。
        """
        ordered_data = FileService._reorder_keys(data)
        
        # ディレクトリがない場合は作成
        directory = os.path.dirname(path)
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)

        async with aiofiles.open(path, mode='w', encoding='utf-8') as f:
            # ensure_ascii=False で日本語をそのまま出力
            content = json.dumps(ordered_data, indent=indent, ensure_ascii=False)
            await f.write(content)

    @staticmethod
    def _reorder_keys(data: Dict[str, Any]) -> OrderedDict:
        """
        要件 F-095 に基づきキーを並べ替える
        1. 優先キー (id, name, tags...)
        2. その他の未知キー (元の順序を維持)
        3. _editor キー (最後)
        """
        result = OrderedDict()
        
        # 1. 優先キー
        for key in FileService.ORDER_PRIORITY:
            if key in data:
                result[key] = data[key]
        
        # 2. その他のキー (優先キーでも_editorでもないもの)
        # 元のDict(OrderedDict)の順序で探索
        for key, value in data.items():
            if key not in FileService.ORDER_PRIORITY and key != FileService.EDITOR_KEY:
                result[key] = value
                
        # 3. _editor キー
        if FileService.EDITOR_KEY in data:
            result[FileService.EDITOR_KEY] = data[FileService.EDITOR_KEY]
            
        return result

    @staticmethod
    def list_files(directory: str, extensions: list = None) -> list:
        """
        指定ディレクトリ配下のファイルを再帰的にリストアップする
        """
        if extensions is None:
            extensions = ['.json']
            
        file_list = []
        if not os.path.exists(directory):
            return file_list

        for root, dirs, files in os.walk(directory):
            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, directory)
                    # Windowsのパス区切りを統一的に扱うために / に置換することも検討
                    file_list.append({
                        "name": file,
                        "path": full_path,
                        "relativePath": rel_path.replace(os.path.sep, '/'),
                        "parent": os.path.basename(root)
                    })
        return file_list

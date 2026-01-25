export class GroupManager {
    constructor(editor) {
        this.editor = editor;
    }

    // ステップ配列をレイアウト情報に基づいてフラット化されたリストに変換する
    // ただし、エディタは「グループ構造」を持ったまま表示したいので、
    // ここでは「グループ情報（_editor.sections）」と「実際のステップデータ」をマージして
    // 表示用のツリー構造を生成するロジックを提供する。

    // データ構造の正規化
    normalizeData(data) {
        if (!data._editor) {
            data._editor = {
                version: 1,
                stepIdKey: "_stepId",
                sections: {}
            };
        }
        ['setup', 'steps', 'teardown'].forEach(section => {
            // ステップIDの付与
            if (data[section]) {
                data[section].forEach(step => {
                    if (!step._stepId) step._stepId = this.generateStepId();
                });

                // _editor情報の初期化
                if (!data._editor.sections[section]) {
                    data._editor.sections[section] = {
                        layout: data[section].map(s => s._stepId),
                        groups: {}
                    };
                } else {
                    // 既存のlayoutと実際のステップの整合性を取る（簡易修復）
                    this.reconcileLayout(data[section], data._editor.sections[section]);
                }
            }
        });
        return data;
    }

    generateStepId() {
        return 'stp_' + Math.random().toString(36).substr(2, 9);
    }

    generateGroupId() {
        return 'grp_' + Math.random().toString(36).substr(2, 9);
    }

    reconcileLayout(steps, sectionMeta) {
        const existingIds = new Set(steps.map(s => s._stepId));
        const layoutIds = new Set();

        // レイアウト内のIDを収集（グループ内含む）
        sectionMeta.layout.forEach(item => {
            if (item.startsWith('grp_')) {
                const grp = sectionMeta.groups[item];
                if (grp && grp.items) {
                    grp.items.forEach(id => layoutIds.add(id));
                }
            } else {
                layoutIds.add(item);
            }
        });

        // レイアウトにないステップを末尾に追加
        steps.forEach(step => {
            if (!layoutIds.has(step._stepId)) {
                sectionMeta.layout.push(step._stepId);
            }
        });

        // レイアウトにあって実体がないステップを除去する処理は
        // 複雑になるので、ここでは簡易的に「表示時」に無視する方針とする。
        // 保存時に再構築する。
    }

    // 表示用の構造（Item[]）を生成
    // Item = { type: 'step', data: Step } | { type: 'group', id: str, name: str, items: Step[], collapsed: bool }
    getDisplayItems(sectionKey, data) {
        const steps = data[sectionKey];
        if (!steps) return [];

        const stepMap = new Map(steps.map(s => [s._stepId, s]));
        const meta = data._editor.sections[sectionKey];

        if (!meta) return steps.map(s => ({ type: 'step', data: s }));

        const displayItems = [];

        meta.layout.forEach(itemId => {
            if (itemId.startsWith('grp_')) {
                const groupMeta = meta.groups[itemId];
                if (groupMeta) {
                    const groupSteps = [];
                    groupMeta.items.forEach(sid => {
                        if (stepMap.has(sid)) groupSteps.push(stepMap.get(sid));
                    });

                    if (groupSteps.length > 0) {
                        displayItems.push({
                            type: 'group',
                            id: itemId,
                            name: groupMeta.name || 'Group',
                            collapsed: !!groupMeta.collapsed,
                            items: groupSteps
                        });
                    }
                }
            } else {
                if (stepMap.has(itemId)) {
                    displayItems.push({ type: 'step', data: stepMap.get(itemId) });
                }
            }
        });

        return displayItems;
    }

    // 保存用にlayoutを再構築する（現在のDOM状態などからではなく、操作の結果として更新する）
    // 操作（グループ化、グループ解除、移動）のエントリポイント

    createGroup(sectionKey, data, selectedStepIds, groupName = "New Group") {
        const meta = data._editor.sections[sectionKey];
        if (!meta) return;

        const newGroupId = this.generateGroupId();
        const targetIds = new Set(selectedStepIds);

        // 新しいレイアウトを構築
        const newLayout = [];
        let inserted = false;

        meta.layout.forEach(itemId => {
            if (itemId.startsWith('grp_')) {
                // 既存グループの中身は触らない（ネストなし前提）
                // ただし、選択されたステップが既存グループに含まれていた場合は除去する必要がある
                // 今回の要件では「ネストなし」。既存グループから引っこ抜く。
                const grp = meta.groups[itemId];
                grp.items = grp.items.filter(sid => !targetIds.has(sid));
                if (grp.items.length > 0) {
                    newLayout.push(itemId);
                } else {
                    // 空になったグループは消す
                    delete meta.groups[itemId];
                }
            } else {
                if (targetIds.has(itemId)) {
                    if (!inserted) {
                        newLayout.push(newGroupId);
                        inserted = true;
                    }
                } else {
                    newLayout.push(itemId);
                }
            }
        });

        if (!inserted) newLayout.push(newGroupId); // fallback

        // グループメタ作成
        // 選択順序を維持したいが、ここでは「元のLayout順」でソートし直すのが自然。
        // リストアップされた順序を守る。
        // 簡易実装：selectedStepIds の順序を信じる（UI側でソート済みであること）

        meta.groups[newGroupId] = {
            name: groupName,
            collapsed: false,
            items: selectedStepIds
        };

        meta.layout = newLayout;
    }

    ungroup(sectionKey, data, groupId) {
        const meta = data._editor.sections[sectionKey];
        if (!meta || !meta.groups[groupId]) return;

        const group = meta.groups[groupId];
        const groupIndex = meta.layout.indexOf(groupId);

        if (groupIndex !== -1) {
            // グループの位置に中身を展開
            meta.layout.splice(groupIndex, 1, ...group.items);
        }

        delete meta.groups[groupId];
    }
}

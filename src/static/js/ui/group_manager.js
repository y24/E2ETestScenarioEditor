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
            // セクションがなければ初期化
            if (!data[section]) {
                data[section] = [];
            }

            // ステップIDの付与
            data[section].forEach(step => {
                if (!step._stepId) step._stepId = this.generateStepId();
            });

            // _editor情報の初期化
            if (!data._editor.sections[section]) {
                data._editor.sections[section] = {
                    layout: data[section].map(s => s._stepId),
                    groups: {},
                    collapsed: false
                };
            } else {
                if (data._editor.sections[section].collapsed === undefined) {
                    data._editor.sections[section].collapsed = false;
                }
                // 既存のlayoutと実際のステップの整合性を取る（簡易修復）
                this.reconcileLayout(data[section], data._editor.sections[section]);
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
        // 1. Map step IDs to their Group IDs
        const stepToGroup = new Map();
        Object.keys(sectionMeta.groups || {}).forEach(groupId => {
            const grp = sectionMeta.groups[groupId];
            if (grp && grp.items) {
                grp.items.forEach(stepId => {
                    stepToGroup.set(stepId, groupId);
                });
            }
        });

        // 2. Rebuild layout based on the order of 'steps' array
        const newLayout = [];
        const processedIds = new Set(); // Tracks added steps and groups

        steps.forEach(step => {
            const stepId = step._stepId;
            if (processedIds.has(stepId)) return; // Already handled (e.g. as part of a group)

            const groupId = stepToGroup.get(stepId);
            if (groupId) {
                // This step belongs to a group
                if (!processedIds.has(groupId)) {
                    // Group not yet added; add it now
                    if (sectionMeta.groups[groupId]) { // Verify group still exists
                        newLayout.push(groupId);
                        processedIds.add(groupId);

                        // Mark all members of this group as processed so we don't add them individually
                        // or add the group again.
                        sectionMeta.groups[groupId].items.forEach(gItem => {
                            processedIds.add(gItem);
                        });
                    } else {
                        // Fallback: Group metadata missing? Treat as standalone
                        newLayout.push(stepId);
                        processedIds.add(stepId);
                    }
                }
                // If group is already processed, do nothing (step is implicitly inside the group)
            } else {
                // Standalone step
                newLayout.push(stepId);
                processedIds.add(stepId);
            }
        });

        // 3. Update the layout
        sectionMeta.layout = newLayout;

        // クリーニング: _children は実行時用プロパティであり保存すべきではないため削除
        Object.values(sectionMeta.groups).forEach(grp => {
            if (grp._children) delete grp._children;
        });
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
                            ignore: !!groupMeta.ignore,
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

    sortSectionDataByLayout(sectionKey, data) {
        const meta = data._editor.sections[sectionKey];
        if (!meta) return;

        const orderedIds = [];
        meta.layout.forEach(itemId => {
            if (itemId.startsWith('grp_')) {
                const grp = meta.groups[itemId];
                if (grp && grp.items) {
                    orderedIds.push(...grp.items);
                }
            } else {
                orderedIds.push(itemId);
            }
        });

        // ID順にステップを並び替える
        const stepMap = new Map(data[sectionKey].map(s => [s._stepId, s]));
        const sortedSteps = [];

        orderedIds.forEach(id => {
            if (stepMap.has(id)) {
                sortedSteps.push(stepMap.get(id));
                stepMap.delete(id);
            }
        });

        // レイアウトに含まれていないステップ（迷子など）があれば末尾に追加
        stepMap.forEach(s => sortedSteps.push(s));

        data[sectionKey] = sortedSteps;
    }
}

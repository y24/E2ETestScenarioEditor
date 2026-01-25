import { GroupManager } from './group_manager.js';
import { showToast } from './toast.js';

export class ScenarioEditor {
    constructor(containerId, onStepSelect, onDataChange) {
        this.container = document.getElementById(containerId);
        this.currentData = null;
        this.sortables = [];
        this.groupManager = new GroupManager(this);

        this.onStepSelect = onStepSelect;
        this.onDataChange = onDataChange;

        this.selectedSteps = new Set(); // Set<stepId>
        this.selectedEl = null;         // Single selection element (legacy support for Right Pane)
        this.selectedStep = null;       // Currently selected step data object
        this.lastCheckedStepId = null;  // For shift-click range selection

        // Bindings
        this.handleSectionAction = this.handleSectionAction.bind(this);
        this.handleStepAction = this.handleStepAction.bind(this);
        this.handleGroupAction = this.handleGroupAction.bind(this);
        this.toggleSelection = this.toggleSelection.bind(this);
        this.groupSelected = this.groupSelected.bind(this);
        this.copySelection = this.copySelection.bind(this);
    }

    render(tab) {
        this.destroySortables();

        if (!tab) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <ion-icon name="document-text-outline"></ion-icon>
                    <p>左側のリストからシナリオを選択するか、新規作成してください</p>
                </div>
            `;
            if (this.onStepSelect) this.onStepSelect(null);
            return;
        }

        // Initialize/Normalize Data
        this.currentData = this.groupManager.normalizeData(tab.data);

        // Render Header
        let html = `
            <div class="scenario-meta">
                <div class="meta-row">
                    <label>ID:</label> <input type="text" class="meta-input" value="${tab.data.id || ''}" id="meta-id">
                    <label>Name:</label> <input type="text" class="meta-input" value="${tab.data.name || ''}" id="meta-name">
                </div>
            </div>
        `;

        // Render Selection Toolbar (Hidden by default unless selected)
        if (this.selectedSteps.size > 0) {
            html += `
                <div class="selection-toolbar">
                    <span class="selection-count">${this.selectedSteps.size} selected</span>
                    <button class="btn-toolbar" id="btn-group-action">
                        <ion-icon name="folder-outline"></ion-icon> Group
                    </button>
                    <button class="btn-toolbar" id="btn-copy-selection">
                        <ion-icon name="copy-outline"></ion-icon> Copy
                    </button>
                    <button class="btn-toolbar" id="btn-clear-selection" style="margin-left: auto;">Cancel</button>
                </div>
            `;
        }

        html += `<div class="steps-container">`;
        html += this.renderSection('Setup', 'setup');
        html += this.renderSection('Steps', 'steps');
        html += this.renderSection('Teardown', 'teardown');
        html += `</div>`;

        this.container.innerHTML = html;

        this.bindMetaEvents();
        this.bindEvents(); // Unified event binding
        this.initSortables();
    }

    renderSection(title, key) {
        const displayItems = this.groupManager.getDisplayItems(key, this.currentData);

        return `
            <div class="section-group" data-section="${key}">
                <div class="section-header">
                    ${title} <span class="badge">${(this.currentData[key] || []).length}</span>
                    <div class="section-header-actions dropdown-container">
                        <button class="btn-add-step section-menu-btn" title="メニュー">
                            <ion-icon name="add-circle-outline"></ion-icon>
                        </button>
                        <div class="dropdown-menu">
                            <button class="dropdown-item" data-action="add" data-section="${key}">
                                <ion-icon name="add-outline"></ion-icon> ステップを追加
                            </button>
                            <button class="dropdown-item" data-action="paste" data-section="${key}">
                                <ion-icon name="clipboard-outline"></ion-icon> 貼り付け
                            </button>
                        </div>
                    </div>
                </div>
                <div class="step-list root-list" id="list-${key}" data-group="root">
                    ${displayItems.map((item, index) => this.renderItem(item, key)).join('')}
                </div>
            </div>
        `;
    }

    renderItem(item, sectionKey) {
        if (item.type === 'group') {
            return this.renderGroup(item, sectionKey);
        } else {
            return this.renderStep(item.data, sectionKey);
        }
    }

    renderGroup(group, sectionKey) {
        const collapsedClass = group.collapsed ? 'collapsed' : '';
        const itemsHtml = group.items.map(s => this.renderStep(s, sectionKey)).join('');

        return `
            <div class="group-item ${collapsedClass}" data-id="${group.id}" data-type="group">
                <div class="group-header">
                    <div class="group-toggle" data-action="toggle-collapse">
                        <ion-icon name="${group.collapsed ? 'chevron-forward-outline' : 'chevron-down-outline'}"></ion-icon>
                    </div>
                    <ion-icon name="folder-open-outline" class="group-icon"></ion-icon>
                    <input type="text" class="group-name" value="${group.name}" readonly ondblclick="this.readOnly=false">
                    <div class="group-actions">
                         <button class="step-action-btn" data-action="ungroup" title="グループ解除">
                            <ion-icon name="folder-open-outline"></ion-icon>
                        </button>
                    </div>
                </div>
                <div class="group-body step-list" id="group-list-${group.id}" data-group="${group.id}">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    renderStep(step, sectionKey) {
        const typeIcon = this.getIconForStep(step);
        const name = step.name || 'Untitled Step';
        const operation = step.params && step.params.operation ? step.params.operation : '';
        const ignoredClass = step.ignore ? 'ignored' : '';
        const isSelected = this.selectedSteps.has(step._stepId) ? 'selected' : '';
        const checked = this.selectedSteps.has(step._stepId) ? 'checked' : '';

        return `
            <div class="step-item ${ignoredClass} ${isSelected}" data-id="${step._stepId}" data-type="step" data-section="${sectionKey}">
                <div class="step-grip"><ion-icon name="reorder-two-outline"></ion-icon></div>
                <input type="checkbox" class="step-checkbox" ${checked}>
                <div class="step-icon_type" title="${step.type}">${typeIcon}</div>
                <div class="step-content">
                    <div class="step-name">${name}</div>
                    <div class="step-desc">${operation}</div>
                </div>
                <div class="step-actions">
                    <button class="step-action-btn" data-action="duplicate" title="複製">
                        <ion-icon name="copy-outline"></ion-icon>
                    </button>
                    <button class="step-action-btn btn-danger" data-action="delete" title="削除">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </div>
            </div>
        `;
    }

    static ICON_MAPPING = null;

    setIcons(icons) {
        ScenarioEditor.ICON_MAPPING = icons;
    }

    getIconForStep(step) {
        const type = step.type;
        const operation = (step.params?.operation || '').trim().toLowerCase();

        if (!ScenarioEditor.ICON_MAPPING) {
            return '<ion-icon name="cube-outline"></ion-icon>';
        }

        let iconName = ScenarioEditor.ICON_MAPPING.types[type] || ScenarioEditor.ICON_MAPPING.default;

        if (type === 'ui' && ScenarioEditor.ICON_MAPPING.operations[operation]) {
            iconName = ScenarioEditor.ICON_MAPPING.operations[operation];
        }

        return `<ion-icon name="${iconName}"></ion-icon>`;
    }

    // --- Events ---

    bindEvents() {
        // Section Menu Toggle
        this.container.querySelectorAll('.section-menu-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                // Close others
                this.container.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
                // Toggle current
                const menu = btn.nextElementSibling;
                menu.classList.toggle('visible');
            };
        });

        // Dropdown Items (Add, Paste)
        this.container.querySelectorAll('.dropdown-item').forEach(btn =>
            btn.onclick = (e) => {
                e.stopPropagation();
                // Close menu
                btn.closest('.dropdown-menu').classList.remove('visible');
                this.handleSectionAction(e);
            });

        // Close dropdowns on outside click
        document.addEventListener('click', () => {
            this.container.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
        });

        // Step Actions
        this.container.querySelectorAll('.step-action-btn').forEach(btn =>
            btn.onclick = this.handleStepAction);

        // Checkboxes & Click Selection
        this.container.querySelectorAll('.step-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.closest('.step-grip') || e.target.closest('.step-action-btn') || e.target.tagName === 'INPUT') return;
                this.selectSingleStep(el);
            };
            const cb = el.querySelector('.step-checkbox');
            if (cb) cb.onclick = (e) => this.toggleSelection(el.dataset.id, e.target.checked, e.shiftKey);
        });

        // Group Actions
        this.container.querySelectorAll('.group-toggle').forEach(el => {
            el.onclick = (e) => this.toggleGroupCollapse(e);
        });

        // Group Name Edit
        this.container.querySelectorAll('.group-name').forEach(el => {
            el.onchange = (e) => this.renameGroup(e);
            el.onblur = (e) => e.target.readOnly = true;
            el.onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
        });

        // Toolbar Actions
        const btnGroup = document.getElementById('btn-group-action');
        if (btnGroup) btnGroup.onclick = this.groupSelected;

        const btnCopy = document.getElementById('btn-copy-selection');
        if (btnCopy) btnCopy.onclick = this.copySelection;

        const btnClear = document.getElementById('btn-clear-selection');
        if (btnClear) btnClear.onclick = () => {
            this.selectedSteps.clear();
            this.rerender();
        };
    }

    initSortables() {
        // Root lists
        const roots = this.container.querySelectorAll('.step-list.root-list');
        roots.forEach(el => {
            this.createSortable(el, 'shared');
        });

        // Group lists (nested)
        const groups = this.container.querySelectorAll('.group-body');
        groups.forEach(el => {
            this.createSortable(el, 'shared');
        });
    }

    createSortable(el, groupName) {
        const sortable = new Sortable(el, {
            group: groupName,
            animation: 150,
            handle: '.step-grip',
            onEnd: (evt) => this.handleDragEnd(evt)
        });
        this.sortables.push(sortable);
    }

    // --- Actions ---

    handleSectionAction(e) {
        const btn = e.currentTarget;
        const action = btn.dataset.action;
        const section = btn.dataset.section;

        if (action === 'add') {
            this.groupManager.editor = this;
            this.addStep(section);
        } else if (action === 'paste') {
            this.groupManager.editor = this;
            this.pasteSteps(section);
        }
    }

    handleGroupAction(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const action = btn.dataset.action;
        const groupItem = btn.closest('.group-item');
        const section = groupItem.closest('.section-group').dataset.section;

        if (action === 'ungroup') {
            this.ungroup(section, groupItem.dataset.id);
        }
    }

    handleStepAction(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const action = btn.dataset.action;
        const stepItem = btn.closest('.step-item');

        const stepId = stepItem.dataset.id;
        const section = stepItem.dataset.section;

        if (action === 'delete') {
            this.deleteStep(section, stepId);
        } else if (action === 'duplicate') {
            this.duplicateStep(section, stepId);
        } else if (action === 'ungroup') {
            // Up for group button?
        }

        // Handle Group Header Buttons
        const groupItem = btn.closest('.group-item');
        if (groupItem && action === 'ungroup') {
            this.ungroup(section, groupItem.dataset.id);
        }
    }

    toggleSelection(stepId, checked, shiftKey = false) {
        if (shiftKey && this.lastCheckedStepId) {
            const allSteps = Array.from(this.container.querySelectorAll('.step-item'));
            const lastIdx = allSteps.findIndex(el => el.dataset.id === this.lastCheckedStepId);
            const currIdx = allSteps.findIndex(el => el.dataset.id === stepId);

            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);

                // Range selection: apply 'checked' state to all items in range
                for (let i = start; i <= end; i++) {
                    const id = allSteps[i].dataset.id;
                    if (checked) this.selectedSteps.add(id);
                    else this.selectedSteps.delete(id);
                }
            } else {
                // Fallback if ID not found (e.g. filtered out)
                if (checked) this.selectedSteps.add(stepId);
                else this.selectedSteps.delete(stepId);
                this.lastCheckedStepId = stepId;
            }
        } else {
            // Normal click
            if (checked) this.selectedSteps.add(stepId);
            else this.selectedSteps.delete(stepId);
            this.lastCheckedStepId = stepId;
        }
        this.rerender();
    }

    selectSingleStep(el) {
        // UI Highlight for Single Selection (Legacy/Properties)
        if (this.selectedEl) this.selectedEl.classList.remove('selected-primary');
        el.classList.add('selected-primary'); // CSS to distinct from checkbox selection?
        this.selectedEl = el;

        const stepId = el.dataset.id;
        const section = el.dataset.section;
        const stepData = this.currentData[section].find(s => s._stepId === stepId);

        this.selectedStep = stepData;
        if (this.onStepSelect) this.onStepSelect(stepData);
    }

    groupSelected() {
        if (this.selectedSteps.size === 0) return;

        // Determine section. Groups can only happen within one section.
        // Take the section of the first selected item.
        // Ideally should validate all are in same section.
        const firstId = this.selectedSteps.values().next().value;
        let sectionKey = null;
        ['setup', 'steps', 'teardown'].forEach(k => {
            if (this.currentData[k].find(s => s._stepId === firstId)) sectionKey = k;
        });

        if (!sectionKey) return;

        // Perform Grouping
        this.groupManager.createGroup(sectionKey, this.currentData, Array.from(this.selectedSteps));

        this.selectedSteps.clear();
        this.rerender();
        this.onDataChange();
    }

    ungroup(sectionKey, groupId) {
        this.groupManager.ungroup(sectionKey, this.currentData, groupId);
        this.rerender();
        this.onDataChange();
    }

    toggleGroupCollapse(e) {
        const groupItem = e.currentTarget.closest('.group-item');
        const groupId = groupItem.dataset.id;
        const sectionGroup = groupItem.closest('.section-group');
        const sectionKey = sectionGroup.dataset.section;

        const grp = this.currentData._editor.sections[sectionKey].groups[groupId];
        if (grp) {
            grp.collapsed = !grp.collapsed;
            this.rerender();
            this.onDataChange(); // Save state
        }
    }

    renameGroup(e) {
        const input = e.target;
        const groupItem = input.closest('.group-item');
        const groupId = groupItem.dataset.id;
        const sectionKey = groupItem.closest('.section-group').dataset.section;

        const grp = this.currentData._editor.sections[sectionKey].groups[groupId];
        if (grp) {
            grp.name = input.value;
            this.onDataChange();
        }
    }

    // --- CRUD Adaptations ---

    addStep(sectionKey) {
        if (!this.currentData[sectionKey]) this.currentData[sectionKey] = [];
        const newStep = {
            name: "新しいステップ",
            type: "system",
            params: { action: "" },
            _stepId: this.groupManager.generateStepId()
        };
        this.currentData[sectionKey].push(newStep);

        // Add to layout
        const meta = this.currentData._editor.sections[sectionKey];
        if (meta) meta.layout.push(newStep._stepId);

        this.rerender();
        this.onDataChange();
    }

    deleteStep(sectionKey, stepId) {
        if (!confirm("削除しますか？")) return;

        // Remove from data
        const index = this.currentData[sectionKey].findIndex(s => s._stepId === stepId);
        if (index > -1) this.currentData[sectionKey].splice(index, 1);

        // Remove from Layout and Groups
        const meta = this.currentData._editor.sections[sectionKey];
        if (meta) {
            meta.layout = meta.layout.filter(id => id !== stepId);
            Object.values(meta.groups).forEach(grp => {
                grp.items = grp.items.filter(id => id !== stepId);
            });
        }

        this.selectedSteps.delete(stepId);
        this.rerender();
        this.onDataChange();
    }

    duplicateStep(sectionKey, stepId) {
        const stepStr = JSON.stringify(this.currentData[sectionKey].find(s => s._stepId === stepId));
        if (!stepStr) return;

        const newStep = JSON.parse(stepStr);
        newStep.name += " (Copy)";
        newStep._stepId = this.groupManager.generateStepId();

        this.currentData[sectionKey].push(newStep);

        // Insert into layout after original
        const meta = this.currentData._editor.sections[sectionKey];
        if (meta) {
            // Find where original is (root or group)
            let inserted = false;

            // Check root
            const rootIdx = meta.layout.indexOf(stepId);
            if (rootIdx > -1) {
                meta.layout.splice(rootIdx + 1, 0, newStep._stepId);
                inserted = true;
            }

            // Check groups
            if (!inserted) {
                for (const grp of Object.values(meta.groups)) {
                    const idx = grp.items.indexOf(stepId);
                    if (idx > -1) {
                        grp.items.splice(idx + 1, 0, newStep._stepId);
                        inserted = true;
                        break;
                    }
                }
            }

            if (!inserted) meta.layout.push(newStep._stepId);
        }

        this.rerender();
        this.onDataChange();
    }

    async copySelection() {
        if (this.selectedSteps.size === 0) return;
        const steps = [];

        ['setup', 'steps', 'teardown'].forEach(section => {
            const meta = this.currentData._editor.sections[section];
            if (!meta) return;

            // Follow layout order
            meta.layout.forEach(itemId => {
                if (itemId.startsWith('grp_')) {
                    const grp = meta.groups[itemId];
                    if (grp) {
                        grp.items.forEach(sid => {
                            if (this.selectedSteps.has(sid)) {
                                const s = this.currentData[section].find(x => x._stepId === sid);
                                if (s) steps.push(s);
                            }
                        });
                    }
                } else {
                    if (this.selectedSteps.has(itemId)) {
                        const s = this.currentData[section].find(x => x._stepId === itemId);
                        if (s) steps.push(s);
                    }
                }
            });
        });

        if (steps.length > 0) {
            try {
                await navigator.clipboard.writeText(JSON.stringify(steps, null, 2));
                showToast('コピーしました');
            } catch (err) {
                console.error('Failed to copy: ', err);
                alert('Copy failed: ' + err.message);
            }
        }
    }

    async pasteSteps(sectionKey) {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            let steps;
            try {
                steps = JSON.parse(text);
            } catch (e) {
                alert('Clipboard does not contain valid JSON');
                return;
            }

            if (!Array.isArray(steps)) steps = [steps];
            steps = steps.filter(s => s && s.type);

            if (steps.length === 0) return;

            if (!this.currentData[sectionKey]) this.currentData[sectionKey] = [];
            const meta = this.currentData._editor.sections[sectionKey];

            steps.forEach(s => {
                s._stepId = this.groupManager.generateStepId();

                this.currentData[sectionKey].push(s);

                if (meta) meta.layout.push(s._stepId);
            });

            this.rerender();
            this.onDataChange();

        } catch (err) {
            console.error('Failed to paste: ', err);
            alert('Paste failed: ' + err.message);
        }
    }

    // --- Drag & Drop ---

    handleDragEnd(evt) {
        // Complex logic needed for nesting support.
        // For now, assume simple reordering within same container.

        const { item, from, to, newIndex } = evt;
        const stepId = item.dataset.id;

        // Identify source and target containers
        const fromGroup = from.dataset.group; // 'root' or groupId
        const toGroup = to.dataset.group;

        const sectionKey = item.closest('.section-group').dataset.section;
        const meta = this.currentData._editor.sections[sectionKey];

        // Remove from old location
        if (fromGroup === 'root') {
            meta.layout = meta.layout.filter(id => id !== stepId);
        } else {
            const grp = meta.groups[fromGroup];
            if (grp) grp.items = grp.items.filter(id => id !== stepId);
        }

        // Insert into new location
        if (toGroup === 'root') {
            meta.layout.splice(newIndex, 0, stepId);
        } else {
            const grp = meta.groups[toGroup];
            if (grp) grp.items.splice(newIndex, 0, stepId);
        }

        this.onDataChange();
    }

    refreshSelectedStep() {
        if (!this.selectedEl || !this.selectedStep) return;
        this.selectedEl.querySelector('.step-name').textContent = this.selectedStep.name || 'Untitled';
        this.selectedEl.querySelector('.step-desc').textContent = this.selectedStep.params?.operation || '';

        // Update Icon
        const iconTypeEl = this.selectedEl.querySelector('.step-icon_type');
        if (iconTypeEl) {
            iconTypeEl.innerHTML = this.getIconForStep(this.selectedStep);
            iconTypeEl.title = this.selectedStep.type;
        }

        if (this.selectedStep.ignore) this.selectedEl.classList.add('ignored');
        else this.selectedEl.classList.remove('ignored');
    }

    rerender() {
        this.render({ data: this.currentData }); // Mock tab object wrapper
    }

    bindMetaEvents() {
        ['id', 'name'].forEach(key => {
            const el = document.getElementById(`meta-${key}`);
            if (el) {
                el.oninput = (e) => {
                    this.currentData[key] = e.target.value;
                    if (this.onDataChange) this.onDataChange();
                };
            }
        });
    }

    destroySortables() {
        this.sortables.forEach(s => s.destroy());
        this.sortables = [];
    }
}

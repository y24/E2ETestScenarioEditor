import { GroupManager } from './group_manager.js';
import { showToast } from './toast.js';

export class ScenarioEditor {
    constructor(containerId, onStepSelect, onDataChange, metaModal, itemRenameModal, genericConfirmModal) {
        this.container = document.getElementById(containerId);
        this.sortables = [];
        this.groupManager = new GroupManager(this);

        this.onStepSelect = onStepSelect;
        this.onDataChange = onDataChange;
        this.metaModal = metaModal;
        this.itemRenameModal = itemRenameModal;
        this.genericConfirmModal = genericConfirmModal;

        if (this.itemRenameModal) {
            this.itemRenameModal.onConfirm = (sectionKey, itemId, newName) => {
                if (itemId.startsWith('grp_')) {
                    const grp = this.currentData._editor.sections[sectionKey].groups[itemId];
                    if (grp) grp.name = newName;
                } else {
                    const step = this.currentData[sectionKey].find(s => s._stepId === itemId);
                    if (step) step.name = newName;
                }
                this.onDataChange();
                this.rerender();

                // Synchronize Properties Panel if the renamed item is currently active
                if (itemId === this.activeItemId && this.onStepSelect && this.selectedStep) {
                    this.onStepSelect(this.selectedStep);
                }
            };
        }

        this.selectedSteps = new Set(); // Set<stepId>
        this.selectedEl = null;         // Single selection element (legacy support for Right Pane)
        this.selectedStep = null;       // Currently selected step data object
        this.activeItemId = null;       // ID of the active item for properties
        this.lastCheckedStepId = null;  // For shift-click range selection

        // Internal clipboard for paste operations (avoids browser permission dialogs)
        this.internalClipboard = null;

        // Bindings
        this.handleSectionAction = this.handleSectionAction.bind(this);
        this.handleStepAction = this.handleStepAction.bind(this);
        this.toggleSelection = this.toggleSelection.bind(this);
        this.groupSelected = this.groupSelected.bind(this);
        this.copySelection = this.copySelection.bind(this);

        this.actionParamsConfig = {};

        this.bindGlobalKeys();
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
            this.selectedSteps.clear();
            this.activeItemId = null;
            this.selectedStep = null;
            if (this.onStepSelect) this.onStepSelect(null);
            return;
        }

        // Initialize/Normalize Data
        this.currentData = this.groupManager.normalizeData(tab.data);

        // Restore selection state from tab
        if (!tab.uiState) {
            tab.uiState = {
                selectedSteps: new Set(),
                activeItemId: null,
                selectedStep: null
            };
        }
        this.selectedSteps = tab.uiState.selectedSteps;
        this.activeItemId = tab.uiState.activeItemId;
        this.selectedStep = null; // Re-find from current data

        if (this.activeItemId) {
            let found = false;
            for (const section of ['setup', 'steps', 'teardown']) {
                if (this.activeItemId.startsWith('grp_')) {
                    const grp = this.currentData._editor.sections[section].groups[this.activeItemId];
                    if (grp) {
                        this.selectedStep = grp;
                        this.selectedStep._isGroup = true;
                        this.selectedStep._groupId = this.activeItemId;
                        this.selectedStep._section = section;
                        // Re-link children (non-enumerable)
                        const children = (this.selectedStep.items || [])
                            .map(sid => (this.currentData[section] || []).find(s => s._stepId === sid))
                            .filter(s => !!s);
                        Object.defineProperty(this.selectedStep, '_children', {
                            value: children,
                            writable: true,
                            enumerable: false,
                            configurable: true
                        });
                        found = true;
                        break;
                    }
                } else {
                    const step = (this.currentData[section] || []).find(s => s._stepId === this.activeItemId);
                    if (step) {
                        this.selectedStep = step;
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                this.activeItemId = null;
                tab.uiState.activeItemId = null;
                tab.uiState.selectedStep = null;
            } else {
                tab.uiState.selectedStep = this.selectedStep;
            }
        }
        this.currentTab = tab;

        // Render Header
        const idHtml = tab.data.id ? `<span class="meta-value meta-id" title="Scenario ID">${tab.data.id}</span>` : '<span class="placeholder">(ID未設定)</span>';
        const nameHtml = tab.data.name ? `<span class="meta-value meta-name" title="Scenario Name">${tab.data.name}</span>` : '<span class="placeholder">(名称未設定)</span>';

        let html = `
            <div class="scenario-meta">
                <div class="meta-row">
                    <div class="meta-field">
                        ${idHtml}
                    </div>
                    <div class="meta-field">
                        ${nameHtml}
                    </div>
                    <button id="btn-edit-meta" class="icon-btn-small meta-edit-btn" title="基本情報を編集">
                        <ion-icon name="create-outline"></ion-icon> 編集
                    </button>
                </div>
            </div>
        `;

        html += `<div class="steps-container">`;
        html += this.renderSection('Setup', 'setup');
        html += this.renderSection('Steps', 'steps');
        html += this.renderSection('Teardown', 'teardown');
        html += `</div>`;

        // Render Selection Toolbar (Fixed at the bottom via CSS)
        if (this.selectedSteps.size > 0) {
            const hasGroupSelected = Array.from(this.selectedSteps).some(id => id.startsWith('grp_'));
            const groupBtnLabel = hasGroupSelected ? 'Ungroup' : 'Group';
            const groupBtnIcon = hasGroupSelected ? 'folder-open-outline' : 'folder-outline';

            const allIgnored = this.isSelectionAllIgnored();
            const disableBtnLabel = allIgnored ? 'Enable' : 'Disable';
            const disableBtnIcon = allIgnored ? 'eye-outline' : 'eye-off-outline';

            html += `
                <div class="selection-toolbar">
                    <span class="selection-count">${this.selectedSteps.size} selected</span>
                    <button class="btn-toolbar" id="btn-group-action">
                        <ion-icon name="${groupBtnIcon}"></ion-icon> ${groupBtnLabel}
                    </button>
                    <button class="btn-toolbar" id="btn-toggle-disable">
                        <ion-icon name="${disableBtnIcon}"></ion-icon> ${disableBtnLabel}
                    </button>
                    <button class="btn-toolbar" id="btn-copy-selection">
                        <ion-icon name="copy-outline"></ion-icon> Copy
                    </button>
                    <button class="btn-toolbar btn-danger" id="btn-delete-selection">
                        <ion-icon name="trash-outline"></ion-icon> Delete
                    </button>
                    <button class="btn-toolbar" id="btn-clear-selection" style="margin-left: auto;">Cancel</button>
                </div>
            `;
        }

        this.container.innerHTML = html;

        this.bindMetaEvents();
        this.bindEvents(); // Unified event binding
        this.initSortables();

        // Update selectedEl reference after rerender
        if (this.activeItemId) {
            this.selectedEl = this.container.querySelector(`[data-id="${this.activeItemId}"]`);
        }
    }

    renderSection(title, key) {
        const displayItems = this.groupManager.getDisplayItems(key, this.currentData);
        const sectionMeta = this.currentData._editor.sections[key];
        const isCollapsed = sectionMeta ? sectionMeta.collapsed : false;
        const collapsedClass = isCollapsed ? 'collapsed' : '';

        return `
            <div class="section-group ${collapsedClass}" data-section="${key}">
                <div class="section-header" data-action="toggle-section">
                    <ion-icon name="${isCollapsed ? 'chevron-forward-outline' : 'chevron-down-outline'}"></ion-icon>
                    ${title} <span class="badge">${(this.currentData[key] || []).length}</span>
                    <div class="section-header-actions dropdown-container">
                        <button class="btn-add-step section-menu-btn" title="メニュー">
                            <ion-icon name="add-circle-outline"></ion-icon>
                        </button>
                        <div class="dropdown-menu">
                            <button class="dropdown-item" data-action="add" data-section="${key}">
                                <ion-icon name="add-outline"></ion-icon> ステップを追加
                            </button>
                            <button class="dropdown-item" data-action="paste" data-section="${key}" ${(!this.internalClipboard || this.internalClipboard.length === 0) ? 'disabled' : ''}>
                                <ion-icon name="clipboard-outline"></ion-icon> ステップを貼り付け
                            </button>
                        </div>
                    </div>
                </div>
                <div class="step-list root-list" id="list-${key}" data-group="root" style="${isCollapsed ? 'display: none;' : ''}">
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
        const ignoredClass = group.ignore ? 'ignored' : '';
        const itemsHtml = group.items.map(s => this.renderStep(s, sectionKey)).join('');
        const activeClass = group.id === this.activeItemId ? 'selected-primary' : '';
        const checked = this.selectedSteps.has(group.id) ? 'checked' : '';

        return `
            <div class="group-item ${collapsedClass} ${ignoredClass} ${activeClass}" data-id="${group.id}" data-type="group" data-section="${sectionKey}">
                <div class="group-header">
                    <div class="step-grip"><ion-icon name="reorder-two-outline"></ion-icon></div>
                    <input type="checkbox" class="step-checkbox" ${checked}>
                    <div class="group-toggle" data-action="toggle-collapse">
                        <ion-icon name="${group.collapsed ? 'chevron-forward-outline' : 'chevron-down-outline'}"></ion-icon>
                    </div>
                    <ion-icon name="folder-open-outline" class="group-icon"></ion-icon>
                    <input type="text" class="group-name" value="${group.name}" readonly ondblclick="this.readOnly=false" autocomplete="off">
                    <div class="group-actions">
                        <button class="step-action-btn" data-action="rename-group-modal" title="グループ名を編集">
                            <ion-icon name="create-outline"></ion-icon>
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
        const op = this.getStepDescription(step);
        const ignoredClass = step.ignore ? 'ignored' : '';
        const isSelected = this.selectedSteps.has(step._stepId) ? 'selected' : '';
        const checked = this.selectedSteps.has(step._stepId) ? 'checked' : '';
        const activeClass = step._stepId === this.activeItemId ? 'selected-primary' : '';

        return `
            <div class="step-item ${ignoredClass} ${isSelected} ${activeClass}" data-id="${step._stepId}" data-type="step" data-section="${sectionKey}">
                <div class="step-grip"><ion-icon name="reorder-two-outline"></ion-icon></div>
                <input type="checkbox" class="step-checkbox" ${checked}>
                <div class="step-icon_type" title="${step.type}">${typeIcon}</div>
                <div class="step-content">
                    <div class="step-name">${name}</div>
                    <div class="step-desc">${op}</div>
                </div>
                <div class="step-actions">
                    <button class="step-action-btn" data-action="rename-step-modal" title="ステップ名を編集">
                        <ion-icon name="create-outline"></ion-icon>
                    </button>
                </div>
            </div>
        `;
    }

    static ICON_MAPPING = null;

    setIcons(icons) {
        ScenarioEditor.ICON_MAPPING = icons;
    }

    setActionParamsConfig(config) {
        this.actionParamsConfig = config.actions || {};
    }

    getStepDescription(step) {
        if (!step.params) return '';

        let val = '';
        if (this.actionParamsConfig && this.actionParamsConfig[step.type]) {
            const field = this.actionParamsConfig[step.type].summaryParam;
            if (field) {
                val = step.params[field];
            }
        }

        if (!val && val !== 0 && val !== false) {
            val = step.params.operation || step.params.action || '';
        }

        return val;
    }

    getIconForStep(step) {
        if (!ScenarioEditor.ICON_MAPPING) {
            return '<ion-icon name="cube-outline"></ion-icon>';
        }

        const type = step.type;
        // Some types use 'operation', others use 'action' or even its own 'type' (for verify)
        const op = (step.params?.operation || step.params?.action || step.params?.type || '').trim().toLowerCase();

        // 1. Check if specific operation icon exists
        if (ScenarioEditor.ICON_MAPPING.operations[op]) {
            return `<ion-icon name="${ScenarioEditor.ICON_MAPPING.operations[op]}"></ion-icon>`;
        }

        // 2. Fallback to type icon
        const iconName = ScenarioEditor.ICON_MAPPING.types[type] || ScenarioEditor.ICON_MAPPING.default;
        return `<ion-icon name="${iconName}"></ion-icon>`;
    }

    // --- Events ---

    bindEvents() {
        // Background Click (Deselect)
        this.container.onclick = (e) => {
            // Check if clicked exactly on background elements
            const isBackground = e.target === this.container ||
                e.target.classList.contains('steps-container') ||
                e.target.classList.contains('step-list') ||
                e.target.classList.contains('section-group');

            if (isBackground) {
                this.selectedSteps.clear();
                this.activeItemId = null;
                this.selectedStep = null;
                if (this.currentTab && this.currentTab.uiState) {
                    this.currentTab.uiState.activeItemId = null;
                    this.currentTab.uiState.selectedStep = null;
                }
                this.rerender();
                if (this.onStepSelect) this.onStepSelect(null);
            }
        };

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

        // Step Selection
        this.container.querySelectorAll('.step-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.closest('.step-grip') || e.target.closest('.step-action-btn') || e.target.tagName === 'INPUT') return;
                e.stopPropagation();
                this.selectItem(el, e.shiftKey);
            };
            const cb = el.querySelector('.step-checkbox');
            if (cb) cb.onclick = (e) => this.toggleSelection(el.dataset.id, e.target.checked, e.shiftKey);
        });

        // Group Selection (Header click)
        this.container.querySelectorAll('.group-header').forEach(header => {
            header.onclick = (e) => {
                if (e.target.closest('.step-grip') || e.target.closest('.group-toggle') ||
                    e.target.closest('.group-actions') || e.target.classList.contains('step-checkbox')) return;

                // Allow selection when clicking the name input if it's readonly (not currently editing)
                if (e.target.classList.contains('group-name') && !e.target.readOnly) return;

                this.selectItem(header.closest('.group-item'), e.shiftKey);
            };

            const cb = header.querySelector('.step-checkbox');
            if (cb) cb.onclick = (e) => {
                e.stopPropagation();
                this.toggleSelection(header.closest('.group-item').dataset.id, e.target.checked, e.shiftKey);
            };
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

        // Section Collapse
        this.container.querySelectorAll('.section-header').forEach(header => {
            header.onclick = (e) => {
                if (e.target.closest('.section-header-actions')) return;
                this.toggleSectionCollapse(header.closest('.section-group').dataset.section);
            };
        });

        // Toolbar Actions
        const btnGroup = this.container.querySelector('#btn-group-action');
        if (btnGroup) btnGroup.onclick = this.groupSelected;

        const btnCopy = this.container.querySelector('#btn-copy-selection');
        if (btnCopy) btnCopy.onclick = this.copySelection;

        const btnDelete = this.container.querySelector('#btn-delete-selection');
        if (btnDelete) btnDelete.onclick = () => this.deleteSelection();

        const btnToggleDisable = this.container.querySelector('#btn-toggle-disable');
        if (btnToggleDisable) {
            btnToggleDisable.onclick = () => {
                const allIgnored = this.isSelectionAllIgnored();
                this.toggleIgnoreSelection(!allIgnored);
            };
        }

        const btnClear = this.container.querySelector('#btn-clear-selection');
        if (btnClear) btnClear.onclick = () => {
            this.selectedSteps.clear();
            this.activeItemId = null;
            this.selectedStep = null;
            if (this.currentTab && this.currentTab.uiState) {
                this.currentTab.uiState.activeItemId = null;
                this.currentTab.uiState.selectedStep = null;
            }
            this.rerender();
            if (this.onStepSelect) this.onStepSelect(null);
        };
    }

    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            // Check if any tab is active
            if (!this.currentTab) return;

            // Ignore if focus is in an input field or textarea
            const target = e.target;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // Allow Ctrl+C/V even in inputs? Usually we want standard behavior there.
            // But if it's the group-name input (text), we handle it separately.
            if (isInput) return;

            if (document.querySelector('.modal:not(.hidden)')) return;

            // Handle Arrow Keys
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSteps(e.key === 'ArrowDown' ? 1 : -1);
            }

            // Handle Ctrl+C (Copy)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (this.selectedSteps.size > 0) {
                    e.preventDefault();
                    this.copySelection();
                }
            }

            // Handle Ctrl+V (Paste)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                let section = 'steps';
                if (this.activeItemId) {
                    const el = this.container.querySelector(`[data-id="${this.activeItemId}"]`);
                    if (el) section = el.dataset.section;
                }
                this.pasteSteps(section).catch(err => console.error('Paste error:', err));
            }

            // Handle Delete key
            if (e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) {
                if (this.selectedSteps.size > 0) {
                    e.preventDefault();
                    this.deleteSelection();
                }
            }
        });
    }

    navigateSteps(direction) {
        // Find all visible step and group items in the DOM order
        const items = Array.from(this.container.querySelectorAll('.step-item, .group-item'));
        if (items.length === 0) return;

        let currentIndex = -1;
        if (this.activeItemId) {
            currentIndex = items.findIndex(el => el.dataset.id === this.activeItemId);
        }

        let nextIndex = currentIndex + direction;

        // Clamp selection
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= items.length) nextIndex = items.length - 1;

        if (nextIndex !== currentIndex) {
            const nextEl = items[nextIndex];
            this.selectItem(nextEl);

            // Scroll into view if needed
            nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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
            this.pasteSteps(section).catch(err => {
                console.error('Failed to paste:', err);
            });
        }
    }


    handleStepAction(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const action = btn.dataset.action;
        const stepItem = btn.closest('.step-item');
        const groupItem = btn.closest('.group-item');

        if (stepItem) {
            const stepId = stepItem.dataset.id;
            const section = stepItem.dataset.section;

            if (action === 'rename-step-modal') {
                const step = this.currentData[section].find(s => s._stepId === stepId);
                if (this.itemRenameModal && step) {
                    this.itemRenameModal.open(section, stepId, step.name, { title: 'ステップ名の編集', label: 'ステップ名' });
                }
            }
        } else if (groupItem) {
            const groupId = groupItem.dataset.id;
            const section = groupItem.dataset.section;

            if (action === 'ungroup') {
                this.ungroup(section, groupId);
            } else if (action === 'rename-group-modal') {
                const group = this.currentData._editor.sections[section].groups[groupId];
                if (this.itemRenameModal && group) {
                    this.itemRenameModal.open(section, groupId, group.name, { title: 'グループ名の編集', label: 'グループ名' });
                }
            }
        }
    }

    toggleSelection(stepId, checked, shiftKey = false) {
        if (stepId.startsWith('grp_')) {
            // Group selection: Check/Uncheck the group and all its children
            if (checked) this.selectedSteps.add(stepId);
            else this.selectedSteps.delete(stepId);

            ['setup', 'steps', 'teardown'].forEach(section => {
                const meta = this.currentData._editor.sections[section];
                if (meta && meta.groups[stepId]) {
                    meta.groups[stepId].items.forEach(sid => {
                        if (checked) this.selectedSteps.add(sid);
                        else this.selectedSteps.delete(sid);
                    });
                }
            });
            this.lastCheckedStepId = stepId;
        } else if (shiftKey && this.lastCheckedStepId) {
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

    selectItem(el, shiftKey = false) {
        const itemId = el.dataset.id;
        const section = el.dataset.section;
        const type = el.dataset.type;

        this.activeItemId = itemId;

        // Update tab state BEFORE rerender
        if (this.currentTab && this.currentTab.uiState) {
            this.currentTab.uiState.activeItemId = this.activeItemId;
        }

        // Sync checkbox state for steps
        if (type === 'step') {
            if (shiftKey && this.lastCheckedStepId) {
                const allSteps = Array.from(this.container.querySelectorAll('.step-item'));
                const lastIdx = allSteps.findIndex(item => item.dataset.id === this.lastCheckedStepId);
                const currIdx = allSteps.findIndex(item => item.dataset.id === itemId);

                if (lastIdx !== -1 && currIdx !== -1) {
                    const start = Math.min(lastIdx, currIdx);
                    const end = Math.max(lastIdx, currIdx);

                    for (let i = start; i <= end; i++) {
                        this.selectedSteps.add(allSteps[i].dataset.id);
                    }
                } else {
                    this.selectedSteps.add(itemId);
                }
                this.lastCheckedStepId = itemId;
            } else {
                // "ステップを選択したとき、Propertiesを開くのと同時にチェックボックスをONにしたいです。"
                // "他のステップをクリックして選択するとチェックも解除されます。"
                // "すでにチェックONのステップをクリックしたときは、チェック状態は変化しなくて良いです。"
                const alreadySelectedOnlyThis = this.selectedSteps.size === 1 && this.selectedSteps.has(itemId);
                if (!alreadySelectedOnlyThis) {
                    this.selectedSteps.clear();
                    this.selectedSteps.add(itemId);
                    this.lastCheckedStepId = itemId;
                }
            }
        } else if (type === 'group') {
            // Selection for groups: select the group and all its children
            const alreadySelected = this.selectedSteps.has(itemId);
            if (!alreadySelected || shiftKey) {
                if (!shiftKey) this.selectedSteps.clear();
                this.selectedSteps.add(itemId);

                // Add children
                const grp = this.currentData._editor.sections[section].groups[itemId];
                if (grp && grp.items) {
                    grp.items.forEach(sid => this.selectedSteps.add(sid));
                }
                this.lastCheckedStepId = itemId;
            }
        }

        // We rerender to update checkboxes and 'selected-primary' highlight
        this.rerender();

        // After rerender, get the data and trigger onStepSelect
        let itemData = null;
        if (type === 'group') {
            itemData = this.currentData._editor.sections[section].groups[itemId];
            if (itemData) {
                itemData._isGroup = true;
                itemData._groupId = itemId;
                itemData._section = section;
                const children = itemData.items.map(sid => this.currentData[section].find(s => s._stepId === sid)).filter(s => !!s);
                Object.defineProperty(itemData, '_children', {
                    value: children,
                    writable: true,
                    enumerable: false,
                    configurable: true
                });
            }
        } else {
            itemData = this.currentData[section].find(s => s._stepId === itemId);
        }

        this.selectedStep = itemData;

        // Update tab state again with selectedStep
        if (this.currentTab && this.currentTab.uiState) {
            this.currentTab.uiState.selectedStep = itemData;
        }

        if (this.onStepSelect) this.onStepSelect(itemData);
    }

    groupSelected() {
        if (this.selectedSteps.size === 0) return;

        const selectedGroupIds = Array.from(this.selectedSteps).filter(id => id.startsWith('grp_'));
        if (selectedGroupIds.length > 0) {
            this.genericConfirmModal.open(
                "グループ解除",
                "選択したグループを解除してもよろしいですか？",
                () => {
                    selectedGroupIds.forEach(groupId => {
                        ['setup', 'steps', 'teardown'].forEach(sectionKey => {
                            if (this.currentData._editor.sections[sectionKey].groups[groupId]) {
                                this.groupManager.ungroup(sectionKey, this.currentData, groupId);
                                this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);
                            }
                        });
                        this.selectedSteps.delete(groupId);
                    });
                    this.rerender();
                    this.onDataChange();
                },
                { confirmText: "解除", isDanger: true }
            );
            return;
        }

        // Determine section. Groups can only happen within one section.
        // We find all sections involved in the selection.
        const sectionMap = new Map(); // sectionName -> stepIds[]

        this.selectedSteps.forEach(stepId => {
            ['setup', 'steps', 'teardown'].forEach(k => {
                if (this.currentData[k].find(s => s._stepId === stepId)) {
                    if (!sectionMap.has(k)) sectionMap.set(k, []);
                    sectionMap.get(k).push(stepId);
                }
            });
        });

        if (sectionMap.size === 0) {
            console.error("No valid steps found for grouping");
            this.selectedSteps.clear();
            this.rerender();
            return;
        }

        if (sectionMap.size > 1) {
            showToast("異なるセクションのステップを同時にグループ化することはできません", "error");
            return;
        }

        const [sectionKey, stepIds] = sectionMap.entries().next().value;

        // Perform Grouping
        this.groupManager.createGroup(sectionKey, this.currentData, stepIds);
        this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);

        this.selectedSteps.clear();
        this.rerender();
        this.onDataChange();
    }

    ungroup(sectionKey, groupId) {
        this.groupManager.ungroup(sectionKey, this.currentData, groupId);
        this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);
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

    toggleSectionCollapse(sectionKey) {
        const meta = this.currentData._editor.sections[sectionKey];
        if (meta) {
            meta.collapsed = !meta.collapsed;
            this.rerender();
            this.onDataChange();
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
            type: "none",
            _stepId: this.groupManager.generateStepId()
        };
        this.currentData[sectionKey].push(newStep);

        // Add to layout
        const meta = this.currentData._editor.sections[sectionKey];
        if (meta) {
            // 現在選択中のステップの1つ下に挿入
            const insertionResult = this.findInsertionPoint(sectionKey, meta);
            if (insertionResult) {
                const { isGroup, target, index } = insertionResult;
                if (isGroup) {
                    // グループ内に挿入
                    const grp = meta.groups[target];
                    if (grp) grp.items.splice(index + 1, 0, newStep._stepId);
                } else {
                    // ルートレイアウトに挿入
                    meta.layout.splice(index + 1, 0, newStep._stepId);
                }
            } else {
                // 選択がない場合は末尾に追加
                meta.layout.push(newStep._stepId);
            }
        }

        this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);
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
            // Save to internal clipboard (always succeeds)
            this.internalClipboard = steps;

            // Also try to save to browser clipboard (for external paste)
            try {
                await navigator.clipboard.writeText(JSON.stringify(steps, null, 2));
                showToast('コピーしました');
            } catch (err) {
                console.error('Failed to copy to browser clipboard: ', err);
                // Still show success because internal clipboard worked
                showToast('コピーしました（アプリ内のみ）');
            }
            // Trigger rerender to enable Paste buttons
            this.rerender();
        }
    }

    deleteSelection() {
        if (this.selectedSteps.size === 0) return;

        this.genericConfirmModal.open(
            "一括削除",
            `${this.selectedSteps.size}個の項目を削除してもよろしいですか？`,
            () => {
                const idsToDelete = new Set(this.selectedSteps);

                ['setup', 'steps', 'teardown'].forEach(section => {
                    if (!this.currentData[section]) return;
                    const meta = this.currentData._editor.sections[section];

                    // Remove steps from data
                    this.currentData[section] = this.currentData[section].filter(s => !idsToDelete.has(s._stepId));

                    if (meta) {
                        // Remove from Layout
                        meta.layout = meta.layout.filter(id => !idsToDelete.has(id));

                        // Remove Groups
                        Object.keys(meta.groups).forEach(groupId => {
                            if (idsToDelete.has(groupId)) {
                                delete meta.groups[groupId];
                            } else {
                                const grp = meta.groups[groupId];
                                grp.items = grp.items.filter(sid => !idsToDelete.has(sid));
                            }
                        });

                        this.groupManager.sortSectionDataByLayout(section, this.currentData);
                    }
                });

                this.selectedSteps.clear();
                this.activeItemId = null;
                this.selectedStep = null;
                if (this.currentTab && this.currentTab.uiState) {
                    this.currentTab.uiState.activeItemId = null;
                    this.currentTab.uiState.selectedStep = null;
                }
                this.rerender();
                this.onDataChange();
                if (this.onStepSelect) this.onStepSelect(null);
            },
            { confirmText: "削除", isDanger: true }
        );
    }

    isSelectionAllIgnored() {
        if (this.selectedSteps.size === 0) return false;

        for (const id of this.selectedSteps) {
            let found = false;
            let ignored = false;
            for (const section of ['setup', 'steps', 'teardown']) {
                if (!this.currentData[section]) continue;

                // Check steps
                const step = this.currentData[section].find(s => s._stepId === id);
                if (step) {
                    found = true;
                    if (step.ignore) ignored = true;
                    break;
                }

                // Check groups
                const meta = this.currentData._editor.sections[section];
                if (meta && meta.groups[id]) {
                    found = true;
                    if (meta.groups[id].ignore) ignored = true;
                    break;
                }
            }
            // If we found the item and it was NOT ignored, then not all are ignored.
            if (found && !ignored) {
                return false;
            }
        }
        return true;
    }

    toggleIgnoreSelection(ignore) {
        if (this.selectedSteps.size === 0) return;

        ['setup', 'steps', 'teardown'].forEach(section => {
            if (!this.currentData[section]) return;

            // Handle individual steps
            this.currentData[section].forEach(step => {
                if (this.selectedSteps.has(step._stepId)) {
                    if (ignore) {
                        step.ignore = true;
                    } else {
                        delete step.ignore;
                    }
                }
            });

            // Handle groups
            const meta = this.currentData._editor?.sections[section];
            if (meta && meta.groups) {
                Object.entries(meta.groups).forEach(([groupId, group]) => {
                    if (this.selectedSteps.has(groupId)) {
                        if (ignore) {
                            group.ignore = true;
                        } else {
                            delete group.ignore;
                        }
                        // Ensure all items in the group are also updated (redundant if they were also selected, but safe)
                        group.items.forEach(sid => {
                            const step = this.currentData[section].find(s => s._stepId === sid);
                            if (step) {
                                if (ignore) step.ignore = true;
                                else delete step.ignore;
                            }
                        });
                    }
                });
            }
        });

        this.rerender();
        this.onDataChange();
    }

    async pasteSteps(sectionKey) {
        try {
            let steps = null;

            // First, try to use internal clipboard (no permission needed)
            if (this.internalClipboard && this.internalClipboard.length > 0) {
                steps = JSON.parse(JSON.stringify(this.internalClipboard)); // Deep copy
            } else {
                // Fallback to browser clipboard (requires permission)
                const text = await navigator.clipboard.readText();
                if (!text) return;

                try {
                    steps = JSON.parse(text);
                } catch (e) {
                    alert('クリップボードに有効なJSONが含まれていません');
                    return;
                }
            }

            if (!Array.isArray(steps)) steps = [steps];
            steps = steps.filter(s => s && s.type);

            if (steps.length === 0) return;

            if (!this.currentData[sectionKey]) this.currentData[sectionKey] = [];
            const meta = this.currentData._editor.sections[sectionKey];

            // 現在選択中のステップの1つ下に挿入
            const insertionResult = this.findInsertionPoint(sectionKey, meta);
            let insertIndex = insertionResult ? insertionResult.index + 1 : null;
            let targetGroup = insertionResult && insertionResult.isGroup ? insertionResult.target : null;

            steps.forEach((s, i) => {
                s._stepId = this.groupManager.generateStepId();
                this.currentData[sectionKey].push(s);

                if (meta) {
                    if (targetGroup) {
                        // グループ内に挿入
                        const grp = meta.groups[targetGroup];
                        if (grp) grp.items.splice(insertIndex + i, 0, s._stepId);
                    } else if (insertIndex !== null) {
                        // ルートレイアウトに挿入
                        meta.layout.splice(insertIndex + i, 0, s._stepId);
                    } else {
                        // 選択がない場合は末尾に追加
                        meta.layout.push(s._stepId);
                    }
                }
            });

            this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);
            this.rerender();
            this.onDataChange();
            showToast('貼り付けました');
        } catch (err) {
            console.error('Failed to paste: ', err);
            alert('貼り付けに失敗しました: ' + err.message);
        }
    }

    // 現在選択中のステップの挿入位置を見つける
    findInsertionPoint(sectionKey, meta) {
        if (!this.activeItemId || !meta) return null;

        // アクティブなアイテムが選択されたセクションに属しているか確認
        const activeEl = this.container.querySelector(`[data-id="${this.activeItemId}"]`);
        if (!activeEl || activeEl.dataset.section !== sectionKey) return null;

        const itemId = this.activeItemId;

        // グループが選択されている場合
        if (itemId.startsWith('grp_')) {
            const grp = meta.groups[itemId];
            if (grp && grp.items.length > 0) {
                // グループ内の最後のアイテムの後に挿入
                const lastItemId = grp.items[grp.items.length - 1];
                return {
                    isGroup: true,
                    target: itemId,
                    index: grp.items.length - 1
                };
            }
        }

        // ステップが選択されている場合
        // まずグループ内を探す
        for (const [groupId, grp] of Object.entries(meta.groups)) {
            const idx = grp.items.indexOf(itemId);
            if (idx > -1) {
                return {
                    isGroup: true,
                    target: groupId,
                    index: idx
                };
            }
        }

        // ルートレイアウトを探す
        const rootIdx = meta.layout.indexOf(itemId);
        if (rootIdx > -1) {
            return {
                isGroup: false,
                target: null,
                index: rootIdx
            };
        }

        return null;
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

        this.groupManager.sortSectionDataByLayout(sectionKey, this.currentData);
        this.onDataChange();

        // Dragged item is selected immediately
        this.selectItem(item);
    }

    refreshSelectedStep() {
        if (!this.selectedStep) return;

        // Ensure we have the live element
        if (!this.selectedEl || !document.body.contains(this.selectedEl)) {
            const id = this.activeItemId || (this.selectedStep._isGroup ? this.selectedStep._groupId : this.selectedStep._stepId);
            if (id) {
                this.selectedEl = this.container.querySelector(`[data-id="${id}"]`);
            }
        }

        if (!this.selectedEl) return;

        if (this.selectedStep._isGroup) {
            // Refresh group
            const nameEl = this.selectedEl.querySelector('.group-name');
            if (nameEl) nameEl.value = this.selectedStep.name || 'Group';

            if (this.selectedStep.ignore) this.selectedEl.classList.add('ignored');
            else this.selectedEl.classList.remove('ignored');

            // Find all children in DOM and update their 'ignored' state too
            const body = this.selectedEl.querySelector('.group-body');
            if (body) {
                body.querySelectorAll('.step-item').forEach(childEl => {
                    const sid = childEl.dataset.id;
                    const section = childEl.dataset.section;
                    const sData = this.currentData[section].find(s => s._stepId === sid);
                    if (sData) {
                        if (sData.ignore) childEl.classList.add('ignored');
                        else childEl.classList.remove('ignored');
                    }
                });
            }
        } else {
            // Refresh step
            const nameEl = this.selectedEl.querySelector('.step-name');
            if (nameEl) nameEl.textContent = this.selectedStep.name || 'Untitled';

            const descEl = this.selectedEl.querySelector('.step-desc');
            if (descEl) descEl.textContent = this.getStepDescription(this.selectedStep);

            // Update Icon
            const iconTypeEl = this.selectedEl.querySelector('.step-icon_type');
            if (iconTypeEl) {
                iconTypeEl.innerHTML = this.getIconForStep(this.selectedStep);
                iconTypeEl.title = this.selectedStep.type;
            }

            if (this.selectedStep.ignore) this.selectedEl.classList.add('ignored');
            else this.selectedEl.classList.remove('ignored');
        }
    }

    rerender() {
        if (this.currentTab) {
            this.render(this.currentTab);
        } else {
            this.render({ data: this.currentData }); // Fallback
        }
    }

    bindMetaEvents() {
        const btnEdit = document.getElementById('btn-edit-meta');
        if (btnEdit && this.metaModal) {
            btnEdit.onclick = () => {
                this.metaModal.open(this.currentData);
            };
        }
    }

    destroySortables() {
        this.sortables.forEach(s => s.destroy());
        this.sortables = [];
    }
}

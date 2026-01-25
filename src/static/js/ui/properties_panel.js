export class PropertiesPanel {
    constructor(panelId, onUpdate) {
        this.panel = document.getElementById(panelId);
        this.currentStep = null;
        this.onUpdate = onUpdate; // callback when data changes
        this.actionConfig = {};
    }

    setActionConfig(config) {
        this.actionConfig = config;
    }

    render(step) {
        this.currentStep = step;
        if (!step) {
            this.panel.innerHTML = '<div class="empty-message">変更するステップを選択してください</div>';
            return;
        }

        if (step._isGroup) {
            this.panel.innerHTML = `
                <div class="props-container">
                    <div class="props-header group-props">
                        <ion-icon name="folder-open-outline"></ion-icon>
                        <span style="font-weight: bold; margin-left:8px;">Group Properties</span>
                    </div>
                    <div class="form-group" style="margin-top: 16px;">
                        <label>Group Name</label>
                        <input type="text" id="prop-name" value="${step.name || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" id="prop-group-ignore" ${step.ignore ? 'checked' : ''}>
                            <span>グループ全体を無効化</span>
                        </label>
                    </div>
                    <div class="group-info" style="color: #666; font-size: 0.85rem; border-top: 1px solid #eee; padding-top: 8px;">
                        <p>${step.items.length} steps in this group</p>
                    </div>
                </div>
            `;
            this.bindGroupEvents();
            return;
        }

        const paramsJson = JSON.stringify(step.params || {}, null, 2);

        this.panel.innerHTML = `
            <div class="props-container">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="prop-name" value="${step.name || ''}" class="form-input">
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select id="prop-type" class="form-input">
                        <option value="system" ${step.type === 'system' ? 'selected' : ''}>System</option>
                        <option value="ui" ${step.type === 'ui' ? 'selected' : ''}>UI</option>
                        <option value="web" ${step.type === 'web' ? 'selected' : ''}>Web</option>
                        <option value="excel" ${step.type === 'excel' ? 'selected' : ''}>Excel</option>
                        <option value="verify" ${step.type === 'verify' ? 'selected' : ''}>Verify</option>
                        <option value="debug" ${step.type === 'debug' ? 'selected' : ''}>Debug</option>
                        <option value="screenshot" ${step.type === 'screenshot' ? 'selected' : ''}>Screenshot</option>
                        <option value="other" ${!this.actionConfig[step.type] && step.type !== 'screenshot' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                

                <div class="form-group">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="prop-ignore" ${step.ignore ? 'checked' : ''}>
                        <span>無効化</span>
                    </label>
                </div>

                <hr class="props-divider">

                <div class="form-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <label style="margin-bottom: 0;">Params</label>
                    </div>
                    <div id="params-grid" class="params-grid"></div>
                    <button id="btn-add-param" class="btn-add-param">
                        <ion-icon name="add-outline"></ion-icon> パラメータを追加
                    </button>
                </div>

                <div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
                    <label>Params (JSON)</label>
                    <textarea id="prop-params" class="code-editor">${paramsJson}</textarea>
                </div>
            </div>
        `;

        this.renderParamsGrid();
        this.bindEvents();
    }

    renderParamsGrid() {
        const grid = document.getElementById('params-grid');
        if (!grid) return;

        const params = this.currentStep.params || {};
        grid.innerHTML = '';

        Object.entries(params).forEach(([key, value]) => {
            this.addParamRow(grid, key, value);
        });
    }

    addParamRow(container, key = '', value = '') {
        const row = document.createElement('div');
        row.className = 'params-row';

        const valueStr = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
        const typeConfig = this.actionConfig[this.currentStep.type] || {};

        row.innerHTML = `
            <input type="text" class="form-input param-key" value="${key}" placeholder="Key">
            <div class="param-value-container">
                <input type="text" class="form-input param-value" value="${valueStr}" placeholder="Value" autocomplete="off">
                <div class="combo-arrow" title="選択肢を表示">
                    <ion-icon name="chevron-down-outline"></ion-icon>
                </div>
                <div class="dropdown-menu"></div>
            </div>
            <button class="btn-remove-param" title="削除">
                <ion-icon name="trash-outline"></ion-icon>
            </button>
        `;

        const keyInput = row.querySelector('.param-key');
        const valInput = row.querySelector('.param-value');
        const arrow = row.querySelector('.combo-arrow');
        const menu = row.querySelector('.dropdown-menu');
        const delBtn = row.querySelector('.btn-remove-param');

        // Helper to update current suggestions/arrow based on current key
        const updateArrowVisibility = () => {
            const currentKey = keyInput.value.trim();
            const suggestions = (this.actionConfig[this.currentStep.type] || {})[currentKey];
            arrow.style.display = suggestions ? 'flex' : 'none';
        };

        const toggleDropdown = (show) => {
            if (show) {
                updateArrowVisibility(); // Ensure correct data in datalist context if it was dynamic, though here it's customized
                const currentKey = keyInput.value.trim();
                const suggestions = (this.actionConfig[this.currentStep.type] || {})[currentKey] || [];
                if (suggestions.length === 0) return;

                menu.innerHTML = suggestions.map(s => `
                    <button class="dropdown-item" data-value="${s}">${s}</button>
                `).join('');

                menu.querySelectorAll('.dropdown-item').forEach(btn => {
                    btn.onclick = () => {
                        valInput.value = btn.dataset.value;
                        this.updateParamsFromGrid();
                        toggleDropdown(false);
                    };
                });
                menu.classList.add('visible');
            } else {
                menu.classList.remove('visible');
            }
        };

        // Events
        keyInput.oninput = () => {
            updateArrowVisibility();
            this.updateParamsFromGrid();
        };

        arrow.onclick = (e) => {
            e.stopPropagation();
            const isVisible = menu.classList.contains('visible');
            // Close all other menus first
            document.querySelectorAll('.params-row .dropdown-menu.visible').forEach(m => m.classList.remove('visible'));
            toggleDropdown(!isVisible);
        };

        valInput.oninput = () => this.updateParamsFromGrid();

        // Close on click outside
        const closeHandler = (e) => {
            if (!row.contains(e.target)) {
                toggleDropdown(false);
            }
        };
        document.addEventListener('click', closeHandler);
        // Store handler to clean up if needed (though PropertiesPanel renders often, it's safer)

        delBtn.onclick = () => {
            document.removeEventListener('click', closeHandler);
            row.remove();
            this.updateParamsFromGrid();
        };

        updateArrowVisibility();
        container.appendChild(row);
        return row;
    }

    updateParamsFromGrid() {
        const grid = document.getElementById('params-grid');
        const rows = grid.querySelectorAll('.params-row');
        const newParams = {};

        rows.forEach(row => {
            const key = row.querySelector('.param-key').value.trim();
            let value = row.querySelector('.param-value').value;

            if (key) {
                // Try to infer types
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (value !== '' && !isNaN(value)) value = Number(value);
                else if (value.startsWith('{') || value.startsWith('[')) {
                    try {
                        value = JSON.parse(value);
                    } catch (e) { /* keep as string if not valid JSON */ }
                }

                newParams[key] = value;
            }
        });

        this.currentStep.params = newParams;

        // Update JSON textarea
        const textarea = document.getElementById('prop-params');
        if (textarea) {
            textarea.value = JSON.stringify(newParams, null, 2);
            textarea.style.borderColor = '#ddd';
        }

        this.emitUpdate();
    }

    bindGroupEvents() {
        // Name
        document.getElementById('prop-name').oninput = (e) => {
            this.currentStep.name = e.target.value;
            this.emitUpdate();
        };

        // Ignore
        document.getElementById('prop-group-ignore').onchange = (e) => {
            const ignored = e.target.checked;
            if (ignored) {
                this.currentStep.ignore = true;
            } else {
                delete this.currentStep.ignore;
            }

            // Propagate to children
            if (this.currentStep._children) {
                this.currentStep._children.forEach(child => {
                    if (ignored) child.ignore = true;
                    else delete child.ignore;
                });
            }

            this.emitUpdate();
        };
    }

    bindEvents() {
        // Name
        document.getElementById('prop-name').oninput = (e) => {
            this.currentStep.name = e.target.value;
            this.emitUpdate();
        };

        // Type
        document.getElementById('prop-type').onchange = (e) => {
            this.currentStep.type = e.target.value;
            this.renderParamsGrid(); // Refresh to update datalist associations
            this.emitUpdate();
        };


        // Ignore
        document.getElementById('prop-ignore').onchange = (e) => {
            if (e.target.checked) {
                this.currentStep.ignore = true;
            } else {
                delete this.currentStep.ignore;
            }
            this.emitUpdate();
        };

        // Add Param Button
        document.getElementById('btn-add-param').onclick = () => {
            const grid = document.getElementById('params-grid');
            const row = this.addParamRow(grid);
            row.querySelector('.param-key').focus();
        };

        // JSON Params
        const paramsTextarea = document.getElementById('prop-params');
        paramsTextarea.oninput = (e) => {
            try {
                const newParams = JSON.parse(e.target.value);
                this.currentStep.params = newParams;
                e.target.style.borderColor = '#ddd';
                this.emitUpdate();
            } catch (err) {
                e.target.style.borderColor = 'red';
            }
        };

        paramsTextarea.onchange = (e) => {
            try {
                const newParams = JSON.parse(e.target.value);
                this.currentStep.params = newParams;
                this.renderParamsGrid(); // Sync grid on blur
                this.emitUpdate();
            } catch (err) { }
        };
    }

    emitUpdate() {
        if (this.onUpdate) this.onUpdate();
    }
}

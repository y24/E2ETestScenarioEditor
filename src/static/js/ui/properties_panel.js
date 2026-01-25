export class PropertiesPanel {
    constructor(panelId, onUpdate) {
        this.panel = document.getElementById(panelId);
        this.currentStep = null;
        this.onUpdate = onUpdate; // callback when data changes
    }

    render(step) {
        this.currentStep = step;
        if (!step) {
            this.panel.innerHTML = '<div class="empty-message">変更するステップを選択してください</div>';
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
                        <option value="verification" ${step.type === 'verification' ? 'selected' : ''}>Verification</option>
                        <option value="other" ${step.type !== 'system' && step.type !== 'ui' && step.type !== 'verification' ? 'selected' : ''}>Other</option>
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

        row.innerHTML = `
            <input type="text" class="form-input param-key" value="${key}" placeholder="Key">
            <input type="text" class="form-input param-value" value="${valueStr}" placeholder="Value">
            <button class="btn-remove-param" title="削除">
                <ion-icon name="trash-outline"></ion-icon>
            </button>
        `;

        const keyInput = row.querySelector('.param-key');
        const valInput = row.querySelector('.param-value');
        const delBtn = row.querySelector('.btn-remove-param');

        keyInput.oninput = () => this.updateParamsFromGrid();
        valInput.oninput = () => this.updateParamsFromGrid();
        delBtn.onclick = () => {
            row.remove();
            this.updateParamsFromGrid();
        };

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

    bindEvents() {
        // Name
        document.getElementById('prop-name').oninput = (e) => {
            this.currentStep.name = e.target.value;
            this.emitUpdate();
        };

        // Type
        document.getElementById('prop-type').onchange = (e) => {
            this.currentStep.type = e.target.value;
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

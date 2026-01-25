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
                    <label>Action (params.action)</label>
                    <input type="text" id="prop-action" value="${step.params?.action || ''}" class="form-input">
                </div>

                <div class="form-group">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="prop-ignore" ${step.ignore ? 'checked' : ''}>
                        <span>無効化</span>
                    </label>
                </div>

                <hr class="props-divider">

                <div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
                    <label>Params (JSON)</label>
                    <textarea id="prop-params" class="code-editor">${paramsJson}</textarea>
                </div>
            </div>
        `;

        this.bindEvents();
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

        // Action shortcut
        document.getElementById('prop-action').oninput = (e) => {
            if (!this.currentStep.params) this.currentStep.params = {};
            this.currentStep.params.action = e.target.value;

            // Sync with JSON editor
            const jsonEl = document.getElementById('prop-params');
            jsonEl.value = JSON.stringify(this.currentStep.params, null, 2);

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

        // JSON Params
        document.getElementById('prop-params').onchange = (e) => {
            try {
                const newParams = JSON.parse(e.target.value);
                this.currentStep.params = newParams;

                // Sync Action input
                const actionInput = document.getElementById('prop-action');
                if (actionInput) {
                    actionInput.value = newParams.action || '';
                }

                // Styling for valid JSON
                e.target.style.borderColor = '#ddd';
                this.emitUpdate();
            } catch (err) {
                e.target.style.borderColor = 'red';
            }
        };
    }

    emitUpdate() {
        if (this.onUpdate) this.onUpdate();
    }
}

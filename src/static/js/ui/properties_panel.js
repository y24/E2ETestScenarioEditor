import { API } from '../api.js';

export class PropertiesPanel {
    constructor(panelId, onUpdate, targetSelectorModal, onConfigUpdate) {
        this.panel = document.getElementById(panelId);
        this.currentStep = null;
        this.onUpdate = onUpdate; // callback when data changes
        this.targetSelectorModal = targetSelectorModal;
        this.onConfigUpdate = onConfigUpdate; // callback when UI config matches
        this.actionParamsConfig = {};
        this.appConfig = {};
        this.availableTargets = []; // Cache of available targets
        this.loadAvailableTargets(); // Load targets on initialization
    }

    setActionParamsConfig(config) {
        this.actionParamsConfig = config;
    }

    setAppConfig(config) {
        this.appConfig = config || {};
    }

    async loadAvailableTargets() {
        try {
            const targets = await API.getPageObjects();
            this.availableTargets = targets.map(t => t.target);
        } catch (e) {
            console.error('Failed to load available targets:', e);
            this.availableTargets = [];
        }
    }

    validateTarget(targetValue) {
        if (!targetValue || targetValue.trim() === '') {
            return true; // Empty is considered valid (no error state)
        }
        return this.availableTargets.includes(targetValue.trim());
    }

    render(step) {
        this.currentStep = step;
        const header = document.getElementById('properties-header');

        if (!step) {
            if (header) header.innerHTML = `<span>Properties</span>`;
            this.panel.innerHTML = `<div class="empty-state">
                <ion-icon name="options-outline"></ion-icon>
                <p>編集するステップを選択してください</p>
            </div>`;
            return;
        }

        if (step._isGroup) {
            if (header) {
                header.innerHTML = `
                    <span>Group Properties</span>
                    <label class="checkbox-wrapper header-checkbox">
                        <span>Disabled</span>
                        <input type="checkbox" id="prop-group-ignore" ${step.ignore ? 'checked' : ''}>
                    </label>
                `;
            }
            this.panel.innerHTML = `
                <div class="props-container">
                    <div class="form-group">
                        <label>Group Name</label>
                        <input type="text" id="prop-name" value="${step.name || ''}" class="form-input" autocomplete="off">
                    </div>
                    <div class="group-info" style="color: #666; font-size: 0.85rem; border-top: 1px solid #eee; padding-top: 8px;">
                        <p>${step.items.length} steps in this group</p>
                    </div>
                </div>
            `;
            this.bindGroupEvents();
            return;
        }

        const stepData = {};
        Object.keys(step).forEach(k => {
            if (!k.startsWith('_')) stepData[k] = step[k];
        });
        const fullJson = JSON.stringify(stepData, null, 2);

        if (header) {
            header.innerHTML = `
                <span>Properties</span>
                <label class="checkbox-wrapper header-checkbox">
                    <span>Disabled</span>
                    <input type="checkbox" id="prop-ignore" ${step.ignore ? 'checked' : ''}>
                </label>
            `;
        }

        const isRawDataCollapsed = this.appConfig.ui_settings?.rawDataCollapsed !== false;

        this.panel.innerHTML = `
            <div class="props-container">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="prop-name" value="${step.name || ''}" class="form-input" autocomplete="off">
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select id="prop-type" class="form-input">
                        <option value="none" ${!step.type || step.type === 'none' ? 'selected' : ''}>(なし)</option>
                        ${Object.keys(this.actionParamsConfig).map(type => `
                            <option value="${type}" ${step.type === type ? 'selected' : ''}>${type}</option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <label style="margin-bottom: 0;">Params</label>
                    </div>
                    <div id="params-grid" class="params-grid"></div>
                    <button id="btn-add-param" class="btn-add-param">
                        <ion-icon name="add-outline"></ion-icon> パラメータを追加
                    </button>
                </div>

                <hr class="props-divider">

                <div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
                    <div class="section-header ${isRawDataCollapsed ? 'collapsed' : ''}" id="raw-data-header" style="background: none; border: none; padding: 0; margin-bottom: 8px;">
                        <ion-icon name="chevron-down-outline"></ion-icon>
                        <label style="cursor: pointer; margin-bottom: 0;">Raw Data (JSON)</label>
                    </div>
                    <div id="raw-data-content" class="section-content ${isRawDataCollapsed ? 'collapsed' : ''}" style="flex: 1; flex-direction: column; display: ${isRawDataCollapsed ? 'none' : 'flex'};">
                        <div class="code-editor-wrapper" style="flex: 1; display: flex; position: relative; min-height: 200px;">
                            <div class="code-line-numbers" id="code-line-numbers"></div>
                            <textarea id="prop-params" class="code-editor" spellcheck="false" style="flex: 1;">${fullJson}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.renderParamsGrid();
        this.bindEvents();
        this.updateLineNumbers();
    }

    updateLineNumbers() {
        const textarea = document.getElementById('prop-params');
        const lineNumbers = document.getElementById('code-line-numbers');
        if (!textarea || !lineNumbers) return;

        const lines = textarea.value.split('\n');
        const count = lines.length;
        let numbersHTML = '';
        for (let i = 1; i <= count; i++) {
            numbersHTML += `<div>${i}</div>`;
        }
        lineNumbers.innerHTML = numbersHTML;
        this.syncScroll();
    }

    syncScroll() {
        const textarea = document.getElementById('prop-params');
        const lineNumbers = document.getElementById('code-line-numbers');
        if (!textarea || !lineNumbers) return;
        lineNumbers.scrollTop = textarea.scrollTop;
    }

    renderParamsGrid() {
        const grid = document.getElementById('params-grid');
        if (!grid) return;

        const params = this.currentStep.params || {};
        grid.innerHTML = '';

        const flatParams = this.flattenParams(params);
        Object.entries(flatParams).forEach(([key, value]) => {
            this.addParamRow(grid, key, value);
        });
    }

    addParamRow(container, key = '', value = '') {
        const row = document.createElement('div');
        row.className = 'params-row';

        const valueStr = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
        const typeConfig = this.actionParamsConfig[this.currentStep.type] || {};
        const paramNames = typeConfig.paramNames || [];

        row.innerHTML = `
            <div class="param-key-container">
                <input type="text" class="form-input param-key" value="${key}" placeholder="Key" autocomplete="off">
                ${paramNames.length > 0 ? `
                    <div class="param-key-arrow" title="選択肢を表示">
                        <ion-icon name="chevron-down-outline"></ion-icon>
                    </div>
                    <div class="param-key-dropdown"></div>
                ` : ''}
            </div>
            <div class="param-value-container">
                <input type="text" class="form-input param-value" value="${valueStr}" placeholder="Value" autocomplete="off" ${key === 'target' ? 'readonly' : ''}>
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
        const keyArrow = row.querySelector('.param-key-arrow');
        const keyDropdown = row.querySelector('.param-key-dropdown');
        const valInput = row.querySelector('.param-value');
        const arrow = row.querySelector('.combo-arrow');
        const menu = row.querySelector('.dropdown-menu');
        const delBtn = row.querySelector('.btn-remove-param');

        // Helper to setup target selector behavior
        const checkTargetKey = () => {
            const currentKey = keyInput.value.trim();
            const isTarget = currentKey.toLowerCase() === 'target';
            if (isTarget) {
                valInput.readOnly = true;
                valInput.style.cursor = 'pointer';
                valInput.style.borderStyle = 'dashed';
                // Validate target value
                const isValid = this.validateTarget(valInput.value);
                valInput.style.backgroundColor = isValid ? '#ecf5ff' : '#ffe0e0';
            } else {
                valInput.readOnly = false;
                valInput.style.cursor = 'text';
                valInput.style.backgroundColor = '';
                valInput.style.borderStyle = 'solid';
            }
        };

        // Use mousedown to trigger selector (often more reliable than click for readonly)
        valInput.addEventListener('mousedown', (e) => {
            const currentKey = keyInput.value.trim();
            if (currentKey.toLowerCase() === 'target') {
                e.preventDefault();
                if (this.targetSelectorModal) {
                    this.targetSelectorModal.open(valInput.value, (selectedValue) => {
                        valInput.value = selectedValue;
                        checkTargetKey(); // Re-validate after selection
                        this.updateParamsFromGrid();
                    });
                }
            }
        });

        // Block normal click processing
        valInput.addEventListener('click', (e) => {
            const currentKey = keyInput.value.trim();
            if (currentKey.toLowerCase() === 'target') {
                e.preventDefault();
            }
        });

        // Initial check
        checkTargetKey();

        // Parameter name dropdown functionality
        const toggleKeyDropdown = (show) => {
            if (!keyArrow || !keyDropdown) return;

            if (show) {
                keyDropdown.innerHTML = paramNames.map(name => `
                    <button class="dropdown-item" data-value="${name}">${name}</button>
                `).join('');

                keyDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
                    btn.onclick = () => {
                        keyInput.value = btn.dataset.value;
                        checkTargetKey();
                        updateArrowVisibility();
                        this.updateParamsFromGrid();
                        toggleKeyDropdown(false);
                    };
                });
                keyDropdown.classList.add('visible');
            } else {
                keyDropdown.classList.remove('visible');
            }
        };

        if (keyArrow) {
            keyArrow.onclick = (e) => {
                e.stopPropagation();
                const isVisible = keyDropdown.classList.contains('visible');
                // Close all other menus first
                document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => m.classList.remove('visible'));
                toggleKeyDropdown(!isVisible);
            };
        }

        // Helper to update current suggestions/arrow based on current key
        const updateArrowVisibility = () => {
            const currentKey = keyInput.value.trim();
            const paramValues = (this.actionParamsConfig[this.currentStep.type] || {}).paramValues || {};
            const suggestions = paramValues[currentKey] || [];
            arrow.style.display = suggestions.length > 0 ? 'flex' : 'none';
        };

        const toggleDropdown = (show) => {
            if (show) {
                updateArrowVisibility(); // Ensure correct data in datalist context if it was dynamic, though here it's customized
                const currentKey = keyInput.value.trim();
                const paramValues = (this.actionParamsConfig[this.currentStep.type] || {}).paramValues || {};
                const suggestions = paramValues[currentKey] || [];
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

        // Events - always use input event for text input
        keyInput.oninput = () => {
            checkTargetKey();
            updateArrowVisibility();
            this.updateParamsFromGrid();
        };

        // Open dropdown on focus
        keyInput.onfocus = () => {
            // Close all other dropdowns first
            document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => m.classList.remove('visible'));

            if (paramNames.length > 0) {
                toggleKeyDropdown(true);
            }
        };

        // Open dropdown on click even if already focused
        keyInput.onclick = () => {
            // Close other dropdowns
            document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => {
                if (m !== keyDropdown) m.classList.remove('visible');
            });

            if (paramNames.length > 0 && !keyDropdown.classList.contains('visible')) {
                toggleKeyDropdown(true);
            }
        };

        arrow.onclick = (e) => {
            e.stopPropagation();
            const isVisible = menu.classList.contains('visible');
            // Close all other menus first
            document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => m.classList.remove('visible'));
            toggleDropdown(!isVisible);
        };

        valInput.oninput = () => this.updateParamsFromGrid();

        // Open value dropdown on focus (except for target)
        valInput.onfocus = () => {
            // Close all other dropdowns first
            document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => m.classList.remove('visible'));

            const currentKey = keyInput.value.trim();
            if (currentKey.toLowerCase() !== 'target') {
                const paramValues = (this.actionParamsConfig[this.currentStep.type] || {}).paramValues || {};
                const suggestions = paramValues[currentKey] || [];
                if (suggestions.length > 0) {
                    toggleDropdown(true);
                }
            }
        };

        // Open value dropdown on click even if already focused
        valInput.onclick = (e) => {
            const currentKey = keyInput.value.trim();
            if (currentKey.toLowerCase() === 'target') {
                e.preventDefault();
                return;
            }

            // Close other dropdowns
            document.querySelectorAll('.param-key-dropdown.visible, .dropdown-menu.visible').forEach(m => {
                if (m !== menu) m.classList.remove('visible');
            });

            if (!menu.classList.contains('visible')) {
                const paramValues = (this.actionParamsConfig[this.currentStep.type] || {}).paramValues || {};
                const suggestions = paramValues[currentKey] || [];
                if (suggestions.length > 0) {
                    toggleDropdown(true);
                }
            }
        };

        // Close on click outside
        const closeHandler = (e) => {
            if (!row.contains(e.target)) {
                toggleDropdown(false);
                if (keyDropdown) toggleKeyDropdown(false);
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
        const paramTypes = this.actionParamsConfig.paramTypes || {};
        const newParams = {};

        rows.forEach(row => {
            const key = row.querySelector('.param-key').value.trim();
            let value = row.querySelector('.param-value').value;

            if (key) {
                // Determine logic based on defined type
                let type = paramTypes[key];
                // Fallback to leaf key (e.g. args.timeout -> timeout)
                if (!type && key.includes('.')) {
                    type = paramTypes[key.split('.').pop()];
                }

                if (type) {
                    // Type enforcement
                    if (type === 'string') {
                        // Keep as string
                        value = String(value);
                    } else if (type === 'float' || type === 'number') {
                        if (value !== '' && !isNaN(value)) {
                            value = Number(value);
                        }
                        // else keep as string (invalid number)
                    } else if (type === 'integer' || type === 'int') {
                        if (value !== '' && !isNaN(value)) {
                            value = parseInt(value, 10);
                        }
                    } else if (type === 'boolean' || type === 'bool') {
                        if (value === 'true') value = true;
                        else if (value === 'false') value = false;
                        else if (value === 'True') value = true; // Python style support just in case
                        else if (value === 'False') value = false;
                    }
                } else {
                    // Default inference
                    if (value === 'true') value = true;
                    else if (value === 'false') value = false;
                    else if (value !== '' && !isNaN(value)) value = Number(value);
                    else if (value.startsWith('{') || value.startsWith('[')) {
                        try {
                            value = JSON.parse(value);
                        } catch (e) { /* keep as string if not valid JSON */ }
                    }
                }

                this.setDeepValue(newParams, key, value);
            }
        });

        this.currentStep.params = newParams;
        this.updateRawJsonTextarea();
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
            this.updateRawJsonTextarea();
            this.emitUpdate();
        };

        // Type
        document.getElementById('prop-type').onchange = (e) => {
            this.currentStep.type = e.target.value;
            this.renderParamsGrid();
            this.updateRawJsonTextarea();
            this.emitUpdate();
        };


        // Ignore
        document.getElementById('prop-ignore').onchange = (e) => {
            if (e.target.checked) {
                this.currentStep.ignore = true;
            } else {
                delete this.currentStep.ignore;
            }
            this.updateRawJsonTextarea();
            this.emitUpdate();
        };

        // Add Param Button
        document.getElementById('btn-add-param').onclick = () => {
            const grid = document.getElementById('params-grid');
            const row = this.addParamRow(grid);
            row.querySelector('.param-key').focus();
        };

        // Raw Data JSON
        const paramsTextarea = document.getElementById('prop-params');

        // Handle Tab key for indentation
        paramsTextarea.onkeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                const value = e.target.value;

                if (e.shiftKey) {
                    // Shift+Tab: Remove indentation
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    const lineEnd = value.indexOf('\n', end);
                    const actualEnd = lineEnd === -1 ? value.length : lineEnd;

                    const lines = value.substring(lineStart, actualEnd).split('\n');
                    const dedentedLines = lines.map(line => {
                        if (line.startsWith('  ')) return line.substring(2);
                        if (line.startsWith('\t')) return line.substring(1);
                        return line;
                    });

                    const newText = value.substring(0, lineStart) + dedentedLines.join('\n') + value.substring(actualEnd);
                    e.target.value = newText;

                    // Restore cursor position
                    const removedChars = (value.substring(lineStart, actualEnd).length - dedentedLines.join('\n').length);
                    e.target.selectionStart = Math.max(lineStart, start - Math.min(2, removedChars));
                    e.target.selectionEnd = Math.max(lineStart, end - removedChars);
                } else {
                    // Tab: Add indentation
                    if (start === end) {
                        // No selection: insert tab at cursor
                        e.target.value = value.substring(0, start) + '  ' + value.substring(end);
                        e.target.selectionStart = e.target.selectionEnd = start + 2;
                    } else {
                        // Selection: indent all selected lines
                        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                        const lineEnd = value.indexOf('\n', end);
                        const actualEnd = lineEnd === -1 ? value.length : lineEnd;

                        const lines = value.substring(lineStart, actualEnd).split('\n');
                        const indentedLines = lines.map(line => '  ' + line);

                        const newText = value.substring(0, lineStart) + indentedLines.join('\n') + value.substring(actualEnd);
                        e.target.value = newText;

                        // Restore selection
                        e.target.selectionStart = start + 2;
                        e.target.selectionEnd = end + (indentedLines.length * 2);
                    }
                }

                // Trigger input event to validate JSON
                e.target.dispatchEvent(new Event('input'));
            }
        };

        paramsTextarea.oninput = (e) => {
            try {
                const updated = JSON.parse(e.target.value);
                // Remove non-internal properties
                Object.keys(this.currentStep).forEach(k => {
                    if (!k.startsWith('_')) delete this.currentStep[k];
                });
                // Apply updated properties
                Object.assign(this.currentStep, updated);

                // Sync UI
                const nameInput = document.getElementById('prop-name');
                const typeSelect = document.getElementById('prop-type');
                const ignoreCheck = document.getElementById('prop-ignore');
                if (nameInput) nameInput.value = this.currentStep.name || '';
                if (typeSelect) typeSelect.value = this.currentStep.type || 'none';
                if (ignoreCheck) ignoreCheck.checked = !!this.currentStep.ignore;

                this.renderParamsGrid();
                e.target.style.borderColor = '#d0d0d0';
                this.emitUpdate();
            } catch (err) {
                e.target.style.borderColor = '#e74c3c';
            }
        };

        paramsTextarea.onchange = (e) => {
            this.updateRawJsonTextarea(); // Format on blur
        };

        // Collapsible Raw Data
        const rawHeader = document.getElementById('raw-data-header');
        const rawContent = document.getElementById('raw-data-content');
        if (rawHeader && rawContent) {
            rawHeader.onclick = () => {
                const isCollapsed = rawHeader.classList.toggle('collapsed');
                rawContent.classList.toggle('collapsed', isCollapsed);
                rawContent.style.display = isCollapsed ? 'none' : 'flex';

                // Save to config
                if (!this.appConfig.ui_settings) this.appConfig.ui_settings = {};
                this.appConfig.ui_settings.rawDataCollapsed = isCollapsed;
                if (this.onConfigUpdate) this.onConfigUpdate(this.appConfig);

                if (!isCollapsed) {
                    setTimeout(() => this.updateLineNumbers(), 0);
                }
            };
        }

        // Sync scroll
        paramsTextarea.onscroll = () => this.syncScroll();

        // Update line numbers on input
        paramsTextarea.addEventListener('input', () => this.updateLineNumbers());
    }

    updateRawJsonTextarea() {
        const textarea = document.getElementById('prop-params');
        if (!textarea || !this.currentStep) return;

        const stepData = {};
        Object.keys(this.currentStep).forEach(k => {
            if (!k.startsWith('_')) stepData[k] = this.currentStep[k];
        });
        textarea.value = JSON.stringify(stepData, null, 2);
        textarea.style.borderColor = '#d0d0d0';
        this.updateLineNumbers();
    }

    flattenParams(obj, prefix = '', res = {}) {
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
                this.flattenParams(val, newKey, res);
            } else {
                res[newKey] = val;
            }
        });
        return res;
    }

    setDeepValue(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
                current[part] = {};
            }
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
    }

    emitUpdate() {
        if (this.onUpdate) this.onUpdate();
    }
}

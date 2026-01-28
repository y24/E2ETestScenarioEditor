
import { API } from '../api.js';

export class BaseModal {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.backdrop = document.getElementById('modal-backdrop');
        this._escListener = (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.cancel();
            }
        };
    }

    open() {
        // Close all open dropdowns/menus when a modal opens
        document.querySelectorAll('.visible').forEach(el => {
            el.classList.remove('visible');
        });

        this.modal.classList.remove('hidden');
        this.backdrop.classList.remove('hidden');
        window.addEventListener('keydown', this._escListener);
    }

    close() {
        this.modal.classList.add('hidden');
        this.backdrop.classList.add('hidden');
        window.removeEventListener('keydown', this._escListener);
    }

    cancel() {
        this.close();
    }
}

export class SettingsModal extends BaseModal {
    constructor(saveCallback, getConfigCallback) {
        super('settings-modal');
        this.saveCallback = saveCallback;
        this.getConfigCallback = getConfigCallback;
        this.directories = [];
        this.pageObjectFolder = '';
        this.directoriesContainer = document.getElementById('directories-list');
        this.pageObjectFolderInput = document.getElementById('page-object-folder');
        this.btnPickPageObjectFolder = document.getElementById('btn-pick-page-object-folder');

        if (this.btnPickPageObjectFolder) {
            this.btnPickPageObjectFolder.onclick = () => this.openDirectoryPicker(this.pageObjectFolderInput, null, true);
        }

        this.sharedScenarioInput = document.getElementById('shared-scenario-dir');
        this.btnPickSharedScenario = document.getElementById('btn-pick-shared-scenario');

        if (this.btnPickSharedScenario) {
            this.btnPickSharedScenario.onclick = () => this.openDirectoryPicker(this.sharedScenarioInput, null, true);
        }
        if (this.sharedScenarioInput) {
            this.sharedScenarioInput.readOnly = true;
            this.sharedScenarioInput.classList.add('clickable-input');
            this.sharedScenarioInput.onclick = () => this.openDirectoryPicker(this.sharedScenarioInput, null, true);
        }

        if (this.pageObjectFolderInput) {
            this.pageObjectFolderInput.readOnly = true;
            this.pageObjectFolderInput.classList.add('clickable-input');
            this.pageObjectFolderInput.onclick = () => this.openDirectoryPicker(this.pageObjectFolderInput, null, true);
        }

        // Settings Events
        const btnOpen = document.getElementById('btn-settings');
        if (btnOpen) btnOpen.onclick = () => this.open(this.getConfigCallback ? this.getConfigCallback() : {});

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) btnSave.onclick = () => this.save();

        const btnAddDir = document.getElementById('btn-add-directory');
        if (btnAddDir) btnAddDir.onclick = () => this.addDirectory();

        // Tabs removed, single view
        this.tabs = [];

        // this.templatesContainer = document.getElementById('settings-template-list'); // Removed
    }

    switchTab(tabId) {
        // No-op or simplified as tabs are gone
    }

    open(currentConfig = {}) {
        this.directories = currentConfig.scenario_directories || [];
        this.pageObjectFolder = currentConfig.page_object_folder || '';
        this.sharedScenarioDir = currentConfig.shared_scenario_dir || '';

        if (this.pageObjectFolderInput) {
            this.pageObjectFolderInput.value = this.pageObjectFolder;
        }
        if (this.sharedScenarioInput) {
            this.sharedScenarioInput.value = this.sharedScenarioDir;
        }
        this.renderDirectories();
        // this.switchTab('settings-folders'); // Default tab - removed
        super.open();
    }



    async openDirectoryPicker(pathInput, nameInput, isPageObjectFolder = false) {
        if (this.isPickingDirectory) return;
        this.isPickingDirectory = true;

        try {
            const result = await API.pickDirectory();
            if (result && result.path) {
                pathInput.value = result.path;

                if (!isPageObjectFolder && nameInput) {
                    // パスからフォルダ名を抽出してNameに設定
                    const folderName = result.path.split(/[/\\]/).filter(Boolean).pop();
                    if (folderName) {
                        nameInput.value = folderName;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to pick directory:', e);
            alert('フォルダ選択に失敗しました。');
        } finally {
            this.isPickingDirectory = false;
        }
    }

    renderDirectories() {
        this.directoriesContainer.innerHTML = '';

        this.directories.forEach((dir, index) => {
            const dirItem = document.createElement('div');
            dirItem.className = 'directory-item';

            // --- Path Group (First) ---
            const pathGroup = document.createElement('div');
            pathGroup.className = 'form-group';

            const pathLabel = document.createElement('label');
            pathLabel.textContent = 'Path';

            const inputGroup = document.createElement('div');
            inputGroup.className = 'input-group';

            const pathInput = document.createElement('input');
            pathInput.type = 'text';
            pathInput.className = 'form-input dir-path clickable-input';
            pathInput.value = dir.path || '';
            pathInput.placeholder = 'Absolute path';
            pathInput.readOnly = true;
            pathInput.onclick = () => this.openDirectoryPicker(pathInput, nameInput);

            // --- Name Input (Define early for picker) ---
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'form-input dir-name';
            nameInput.value = dir.name || '';
            nameInput.placeholder = 'e.g., Scenarios';

            const pickBtn = document.createElement('button');
            pickBtn.className = 'btn btn-secondary';
            pickBtn.innerHTML = '<ion-icon name="folder-open-outline"></ion-icon>';
            pickBtn.title = 'フォルダを選択';
            pickBtn.style.padding = '4px 8px';
            pickBtn.style.display = 'flex';
            pickBtn.style.alignItems = 'center';
            pickBtn.onclick = () => this.openDirectoryPicker(pathInput, nameInput);

            inputGroup.appendChild(pathInput);
            inputGroup.appendChild(pickBtn);

            pathGroup.appendChild(pathLabel);
            pathGroup.appendChild(inputGroup);

            // --- Name Group (Second) ---
            const nameGroup = document.createElement('div');
            nameGroup.className = 'form-group';

            const nameLabel = document.createElement('label');
            nameLabel.textContent = 'Name';

            nameGroup.appendChild(nameLabel);
            nameGroup.appendChild(nameInput);

            // --- Actions ---
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger btn-remove-dir';
            removeBtn.dataset.index = index;
            removeBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
            removeBtn.title = 'Remove';
            removeBtn.onclick = () => this.removeDirectory(parseInt(removeBtn.dataset.index));

            dirItem.appendChild(pathGroup);
            dirItem.appendChild(nameGroup);
            dirItem.appendChild(removeBtn);

            this.directoriesContainer.appendChild(dirItem);
        });
    }

    _updateDirectoriesFromUI() {
        const items = this.directoriesContainer.querySelectorAll('.directory-item');
        this.directories = Array.from(items).map(item => ({
            path: item.querySelector('.dir-path').value,
            name: item.querySelector('.dir-name').value
        }));
    }

    addDirectory() {
        this._updateDirectoriesFromUI();
        this.directories.push({ name: '', path: '' });
        this.renderDirectories();
    }

    removeDirectory(index) {
        this._updateDirectoriesFromUI();
        this.directories.splice(index, 1);
        this.renderDirectories();
    }

    async save() {
        this._updateDirectoriesFromUI();
        const newDirectories = this.directories
            .map(d => ({ name: d.name.trim(), path: d.path.trim() }))
            .filter(d => d.name && d.path);

        // Get current full config to preserve other settings (like ui_settings)
        const currentConfig = this.getConfigCallback ? this.getConfigCallback() : {};

        const newConfig = {
            ...currentConfig,
            scenario_directories: newDirectories,
            page_object_folder: this.pageObjectFolderInput ? this.pageObjectFolderInput.value.trim() : null,
            shared_scenario_dir: this.sharedScenarioInput ? this.sharedScenarioInput.value.trim() : null
        };
        await this.saveCallback(newConfig);
        this.close();
    }
}

export class TemplateEditorModal extends BaseModal {
    constructor() {
        super('template-editor-modal');
        this.templatesContainer = document.getElementById('template-editor-list');
        this.jsonEditor = new TemplateJsonEditorModal(() => this.loadTemplates());

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.close();

        // Also close on generic close button in footer if exists
        const btnCloseFooter = this.modal.querySelector('.modal-footer .close-modal');
        if (btnCloseFooter) btnCloseFooter.onclick = () => this.close();
    }

    open() {
        this.loadTemplates();
        super.open();
    }

    async loadTemplates() {
        try {
            const templates = await API.getTemplates();
            this.renderTemplates(templates);
        } catch (e) {
            console.error('Failed to load templates:', e);
            if (this.templatesContainer)
                this.templatesContainer.innerHTML = '<div style="padding:10px; color:red;">Failed to load templates.</div>';
        }
    }

    renderTemplates(templates) {
        if (!this.templatesContainer) return;
        this.templatesContainer.innerHTML = '';
        if (templates.length === 0) {
            this.templatesContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No templates saved.</div>';
            return;
        }

        templates.forEach(t => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.style.cursor = 'pointer';
            item.onclick = () => this.jsonEditor.open(t);

            const info = document.createElement('div');
            info.className = 'template-info';

            const name = document.createElement('div');
            name.className = 'template-name';
            name.textContent = t.name;

            const meta = document.createElement('div');
            meta.className = 'template-meta';
            const dateStr = new Date(t.createdAt * 1000).toLocaleString();
            meta.textContent = `${t.steps.length} steps • ${dateStr}`;

            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'template-actions';

            // Favorite
            const favBtn = document.createElement('button');
            favBtn.className = `icon-btn favorite-btn ${t.isFavorite ? 'active' : ''}`;
            favBtn.innerHTML = t.isFavorite ? '<ion-icon name="star"></ion-icon>' : '<ion-icon name="star-outline"></ion-icon>';
            favBtn.title = t.isFavorite ? 'Remove from favorites' : 'Add to favorites';
            favBtn.onclick = async (e) => {
                e.stopPropagation();
                await this.toggleFavorite(t.id);
            };

            // Delete
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn';
            delBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
            delBtn.title = 'Delete template';
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete template "${t.name}"?`)) {
                    await this.deleteTemplate(t.id);
                }
            };

            actions.appendChild(favBtn);
            actions.appendChild(delBtn);

            item.appendChild(info);
            item.appendChild(actions);
            this.templatesContainer.appendChild(item);
        });
    }

    async toggleFavorite(id) {
        try {
            await API.toggleTemplateFavorite(id);
            this.loadTemplates(); // Reload to update list order
        } catch (e) {
            console.error(e);
            alert('Failed to update favorite status');
        }
    }

    async deleteTemplate(id) {
        try {
            await API.deleteTemplate(id);
            this.loadTemplates();
        } catch (e) {
            console.error(e);
            alert('Failed to delete template');
        }
    }
}

export class SaveAsModal extends BaseModal {
    constructor(saveCallback, getConfigCallback) {
        super('save-modal');
        this.saveCallback = saveCallback;
        this.getConfigCallback = getConfigCallback;

        this.inputDirType = document.getElementById('save-dir-type');
        this.inputSubdir = document.getElementById('save-subdir');
        this.inputFilename = document.getElementById('save-filename');
        this.closeAfterSave = false;
        this.onCancelCallback = null;

        // Events
        const btnClose = this.modal.querySelector('.close-save-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-confirm-save');
        if (btnSave) btnSave.onclick = () => this.confirm();
    }

    open(defaultFilename = '', closeAfterSave = false, defaultSubdir = '', defaultDirIndex = -1, onCancel = null, onSuccess = null) {
        this.onCancelCallback = onCancel;
        this.onSuccessCallback = onSuccess;
        this.closeAfterSave = closeAfterSave;
        this.inputSubdir.value = defaultSubdir;
        this.inputFilename.value = defaultFilename;

        // Populate directory dropdown
        const config = this.getConfigCallback();
        this.inputDirType.innerHTML = '';

        if (config.scenario_directories && config.scenario_directories.length > 0) {
            config.scenario_directories.forEach((dir, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = dir.name;
                if (index === defaultDirIndex) {
                    option.selected = true;
                }
                this.inputDirType.appendChild(option);
            });
        }

        if (config.shared_scenario_dir) {
            const option = document.createElement('option');
            option.value = "-1";
            option.textContent = "scenarios_shared";
            // Check if checking for shared dir logic is needed for default selection, usually defaultDirIndex is -1 for shared if we map it that way? 
            // In duplicateScenario, we pass dirIndex. If it was shared file, how do we know?
            // Existing logic passes dirIndex. If I use -1 for shared, I should match it here.
            if (defaultDirIndex === -1 && this.inputDirType.options.length > 0 && !this.inputDirType.value) {
                // heuristic: if defaultDirIndex is -1 but we have directories, wait. 
                // Actually defaultDirIndex is -1 by default (unselected).
                // We should rely on caller passing correct index. 
                // If caller passes -1 (and it means Shared), we select it.
                // But wait, defaultDirIndex=-1 is default arg.
            }
            if (defaultDirIndex === -1 && config.shared_scenario_dir) {
                // If explicit -1 is passed and we interpret it as shared?
                // Or maybe we need a clearer signal. For now, let's assume -1 means shared if passed explicitly? 
                // But -1 is also "not found".
                // Let's just append it. If passed defaultDirIndex matches -1, it gets selected.
                // Note: values are strings. "-1" vs -1.
                if (String(defaultDirIndex) === "-1") {
                    option.selected = true;
                }
            }
            this.inputDirType.appendChild(option);
        }

        if (this.inputDirType.options.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No directories configured';
            this.inputDirType.appendChild(option);
        }

        super.open();
        this.inputFilename.focus();
        this.inputFilename.select();
    }

    async confirm() {
        const dirIndex = parseInt(this.inputDirType.value);
        const subdir = this.inputSubdir.value.trim();
        let filename = this.inputFilename.value.trim();

        if (!filename) {
            alert('ファイル名を入力してください');
            return;
        }

        if (!filename.endsWith('.json')) {
            filename += '.json';
        }

        const result = {
            dirIndex,
            subdir,
            filename,
            closeAfterSave: this.closeAfterSave
        };

        if (this.onSuccessCallback) {
            await this.onSuccessCallback(result);
        } else {
            await this.saveCallback(result);
        }
        this.close();
        this.closeAfterSave = false;
    }

    cancel() {
        super.cancel();
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
    }
}

export class ConfirmModal extends BaseModal {
    constructor(callbacks) {
        super('confirm-close-modal');
        this.callbacks = callbacks; // { onYes, onNo, onCancel }

        const btnYes = document.getElementById('btn-confirm-yes');
        const btnNo = document.getElementById('btn-confirm-no');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnClose = this.modal.querySelector('.close-confirm-modal');

        if (btnYes) btnYes.onclick = () => { this.close(); if (this.callbacks.onYes) this.callbacks.onYes(); };
        if (btnNo) btnNo.onclick = () => { this.close(); if (this.callbacks.onNo) this.callbacks.onNo(); };
        if (btnCancel) btnCancel.onclick = () => this.cancel();
        if (btnClose) btnClose.onclick = () => this.cancel();
    }

    cancel() {
        this.close();
        if (this.callbacks && this.callbacks.onCancel) {
            this.callbacks.onCancel();
        }
    }

    open(title, message, callbacks) {
        if (title) this.modal.querySelector('h2').textContent = title;
        if (message) this.modal.querySelector('.modal-body p').textContent = message;
        if (callbacks) this.callbacks = callbacks;
        super.open();
    }
}

export class ScenarioMetaModal extends BaseModal {
    constructor(saveCallback) {
        super('meta-modal');
        this.saveCallback = saveCallback;

        this.inputId = document.getElementById('modal-meta-id');
        this.inputName = document.getElementById('modal-meta-name');
        this.inputTags = document.getElementById('modal-meta-tags');
        this.inputDesc = document.getElementById('modal-meta-description');

        const btnClose = this.modal.querySelector('.close-meta-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-save-meta');
        if (btnSave) btnSave.onclick = () => this.save();
    }

    open(data = {}) {
        this.inputId.value = data.id || '';
        this.inputName.value = data.name || '';
        this.inputTags.value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
        this.inputDesc.value = data.description || '';
        super.open();
        this.inputId.focus();
    }

    save() {
        const tags = this.inputTags.value.split(',').map(t => t.trim()).filter(t => t !== '');
        const data = {
            id: this.inputId.value.trim(),
            name: this.inputName.value.trim(),
            tags: tags,
            description: this.inputDesc.value.trim()
        };
        if (this.saveCallback) this.saveCallback(data);
        this.close();
    }
}

export class RenameModal extends BaseModal {
    constructor(onConfirm) {
        super('explorer-rename-modal');
        this.onConfirm = onConfirm;
        this.inputFilename = document.getElementById('rename-filename');
        this.oldPath = null;

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnConfirm = document.getElementById('btn-confirm-rename');
        if (btnConfirm) btnConfirm.onclick = () => this.confirm();

        // Allow Enter key to confirm
        this.inputFilename.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.confirm();
            }
        };
    }

    open(oldPath, currentName) {
        this.oldPath = oldPath;
        this.inputFilename.value = currentName;
        super.open();
        this.inputFilename.focus();
        // Skip extension if possible for easier renaming
        const dotIndex = currentName.lastIndexOf('.');
        if (dotIndex > 0) {
            this.inputFilename.setSelectionRange(0, dotIndex);
        } else {
            this.inputFilename.select();
        }
    }

    async confirm() {
        let newName = this.inputFilename.value.trim();
        if (!newName) return;
        if (!newName.endsWith('.json')) newName += '.json';

        if (this.onConfirm) {
            await this.onConfirm(this.oldPath, newName);
        }
        this.close();
    }
}

export class ItemRenameModal extends BaseModal {
    constructor(onConfirm) {
        super('item-rename-modal');
        this.onConfirm = onConfirm;
        this.titleEl = document.getElementById('item-rename-title');
        this.labelEl = document.getElementById('item-rename-label');
        this.input = document.getElementById('item-rename-input');
        this.sectionKey = null;
        this.itemId = null;

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnConfirm = document.getElementById('btn-item-rename-confirm');
        if (btnConfirm) btnConfirm.onclick = () => this.confirm();

        this.input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.confirm();
            }
        };
    }

    open(sectionKey, itemId, currentName, options = {}) {
        this.sectionKey = sectionKey;
        this.itemId = itemId;
        this.input.value = currentName || '';

        if (options.title) this.titleEl.textContent = options.title;
        if (options.label) this.labelEl.textContent = options.label;

        super.open();
        this.input.focus();
        this.input.select();
    }

    confirm() {
        const newName = this.input.value.trim();
        if (newName && this.onConfirm) {
            this.onConfirm(this.sectionKey, this.itemId, newName);
        }
        this.close();
    }
}

export class GenericConfirmModal extends BaseModal {
    constructor() {
        super('generic-confirm-modal');
        this.titleEl = document.getElementById('generic-confirm-title');
        this.messageEl = document.getElementById('generic-confirm-message');
        this.btnYes = document.getElementById('btn-generic-confirm-yes');
        this.btnNo = document.getElementById('btn-generic-confirm-no');
        this.onYes = null;

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.close();
        if (this.btnNo) this.btnNo.onclick = () => this.close();
        if (this.btnYes) {
            this.btnYes.onclick = () => {
                if (this.onYes) this.onYes();
                this.close();
            };
        }
    }

    open(title, message, onYes, options = {}) {
        this.titleEl.textContent = title || '確認';
        this.messageEl.textContent = message || '実行してもよろしいですか？';
        this.onYes = onYes;

        if (options.confirmText) this.btnYes.textContent = options.confirmText;
        if (options.cancelText) this.btnNo.textContent = options.cancelText;
        if (options.isDanger) {
            this.btnYes.classList.add('btn-danger');
            this.btnYes.classList.remove('btn-primary');
        } else {
            this.btnYes.classList.add('btn-primary');
            this.btnYes.classList.remove('btn-danger');
        }

        super.open();
    }
}

export class SaveTemplateModal extends BaseModal {
    constructor() {
        // Init SaveTemplateModal
        super('save-template-modal');
        this.inputName = document.getElementById('save-template-name');
        this.countSpan = document.getElementById('save-template-count');
        this.steps = [];

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-save-template-confirm');
        if (btnSave) btnSave.onclick = () => this.confirm();

        // Enter key support
        this.inputName.onkeydown = (e) => {
            if (e.key === 'Enter') this.confirm();
        };
    }

    open(steps) {
        this.steps = steps || [];

        // Auto-fill name from the first step if available
        if (this.steps.length > 0 && this.steps[0].name) {
            this.inputName.value = this.steps[0].name;
        } else {
            this.inputName.value = '';
        }

        this.countSpan.textContent = this.steps.length;
        super.open();
        this.inputName.focus();
        this.inputName.select(); // Select the text for easy overwrite
    }

    async confirm() {
        const name = this.inputName.value.trim();
        if (!name) {
            alert('テンプレート名を入力してください');
            return;
        }

        try {
            await API.createTemplate(name, this.steps);
            this.close();
        } catch (e) {
            console.error(e);
            alert('テンプレートの保存に失敗しました');
        }
    }
}

export class SelectTemplateModal extends BaseModal {
    constructor(onSelectCallback) {
        super('select-template-modal');
        this.onSelectCallback = onSelectCallback;
        this.list = document.getElementById('select-template-list');
        this.emptyState = document.getElementById('template-empty-state');

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnCancel = document.getElementById('btn-select-template-cancel');
        if (btnCancel) btnCancel.onclick = () => this.cancel();
    }

    async open(onSelect) {
        if (onSelect) this.onSelectCallback = onSelect;
        super.open();
        this.list.innerHTML = 'Loading...';
        this.emptyState.style.display = 'none';

        try {
            const templates = await API.getTemplates();
            this.renderTemplates(templates);
        } catch (e) {
            console.error(e);
            this.list.innerHTML = 'Failed to load templates.';
        }
    }

    renderTemplates(templates) {
        this.list.innerHTML = '';
        if (templates.length === 0) {
            this.emptyState.style.display = 'flex';
            return;
        }

        this.emptyState.style.display = 'none';

        templates.forEach(t => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.onclick = () => this.selectTemplate(t);
            item.style.cursor = 'pointer';

            const info = document.createElement('div');
            info.className = 'template-info';

            const name = document.createElement('div');
            name.className = 'template-name';
            name.textContent = t.name;

            if (t.isFavorite) {
                const favIcon = document.createElement('ion-icon');
                favIcon.name = 'star';
                favIcon.style.color = '#f1c40f';
                favIcon.style.fontSize = '1em';
                name.prepend(document.createTextNode(' '));
                name.prepend(favIcon);
            }

            const meta = document.createElement('div');
            meta.className = 'template-meta';
            const dateStr = new Date(t.createdAt * 1000).toLocaleString();
            meta.textContent = `${t.steps.length} steps • ${dateStr}`;

            info.appendChild(name);
            info.appendChild(meta);

            // SelectTemplateModal doesn't need delete/favorite actions usually, 
            // as it's for selecting. But we can add favorite toggle if requested.
            // For now keep it simple: click to select.

            item.appendChild(info);
            this.list.appendChild(item);
        });
    }

    selectTemplate(template) {
        if (this.onSelectCallback) {
            this.onSelectCallback(template.steps);
        }
        this.close();
    }
}

export class TemplateJsonEditorModal extends BaseModal {
    constructor(onSaveSuccess) {
        super('template-json-editor-modal');
        this.onSaveSuccess = onSaveSuccess;
        this.inputName = document.getElementById('template-json-name');
        this.inputJson = document.getElementById('template-json-content');
        this.currentTemplateId = null;

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = document.getElementById('btn-template-json-save');
        if (btnSave) btnSave.onclick = () => this.save();
    }

    open(template) {
        this.currentTemplateId = template.id;
        this.inputName.value = template.name;
        // StepsのみをJSONとして表示・編集
        this.inputJson.value = JSON.stringify(template.steps, null, 2);
        super.open();
    }

    async save() {
        const name = this.inputName.value.trim();
        const jsonStr = this.inputJson.value;

        if (!name) {
            alert('テンプレート名を入力してください');
            return;
        }

        let steps;
        try {
            steps = JSON.parse(jsonStr);
            if (!Array.isArray(steps)) {
                throw new Error('Root must be an array of steps');
            }
        } catch (e) {
            alert('JSONが無効です: ' + e.message);
            return;
        }

        try {
            await API.updateTemplate(this.currentTemplateId, name, steps);
            this.close();
            if (this.onSaveSuccess) {
                this.onSaveSuccess();
            }
        } catch (e) {
            console.error(e);
            alert('テンプレートの更新に失敗しました: ' + e.message);
        }
    }
}


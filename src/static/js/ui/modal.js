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

        // Settings Events
        const btnOpen = document.getElementById('btn-settings');
        if (btnOpen) btnOpen.onclick = () => this.open(this.getConfigCallback ? this.getConfigCallback() : {});

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) btnSave.onclick = () => this.save();

        const btnAddDir = document.getElementById('btn-add-directory');
        if (btnAddDir) btnAddDir.onclick = () => this.addDirectory();
    }

    open(currentConfig = {}) {
        this.directories = currentConfig.scenario_directories || [];
        this.pageObjectFolder = currentConfig.page_object_folder || '';
        if (this.pageObjectFolderInput) {
            this.pageObjectFolderInput.value = this.pageObjectFolder;
        }
        this.renderDirectories();
        super.open();
    }

    async openDirectoryPicker(pathInput, nameInput, isPageObjectFolder = false) {
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
            pathInput.className = 'form-input dir-path';
            pathInput.value = dir.path || '';
            pathInput.placeholder = 'Absolute path';

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

        const newConfig = {
            scenario_directories: newDirectories,
            page_object_folder: this.pageObjectFolderInput ? this.pageObjectFolderInput.value.trim() : null
        };
        await this.saveCallback(newConfig);
        this.close();
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

        // Events
        const btnClose = this.modal.querySelector('.close-save-modal');
        if (btnClose) btnClose.onclick = () => this.cancel();

        const btnSave = document.getElementById('btn-confirm-save');
        if (btnSave) btnSave.onclick = () => this.confirm();
    }

    open(defaultFilename = '', closeAfterSave = false, defaultSubdir = '', defaultDirIndex = -1) {
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
        } else {
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

        await this.saveCallback({
            dirIndex,
            subdir,
            filename,
            closeAfterSave: this.closeAfterSave
        });
        this.close();
        this.closeAfterSave = false;
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

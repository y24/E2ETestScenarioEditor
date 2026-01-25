import { API } from '../api.js';

export class BaseModal {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.backdrop = document.getElementById('modal-backdrop');
    }

    open() {
        this.modal.classList.remove('hidden');
        this.backdrop.classList.remove('hidden');
    }

    close() {
        this.modal.classList.add('hidden');
        this.backdrop.classList.add('hidden');
    }
}

export class SettingsModal extends BaseModal {
    constructor(saveCallback, getConfigCallback) {
        super('settings-modal');
        this.saveCallback = saveCallback;
        this.getConfigCallback = getConfigCallback;
        this.directories = [];
        this.directoriesContainer = document.getElementById('directories-list');

        // Settings Events
        const btnOpen = document.getElementById('btn-settings');
        if (btnOpen) btnOpen.onclick = () => this.open(this.getConfigCallback ? this.getConfigCallback() : {});

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) btnSave.onclick = () => this.save();

        const btnAddDir = document.getElementById('btn-add-directory');
        if (btnAddDir) btnAddDir.onclick = () => this.addDirectory();
    }

    open(currentConfig = {}) {
        this.directories = currentConfig.scenario_directories || [];
        this.renderDirectories();
        super.open();
    }

    async openDirectoryPicker(pathInput, nameInput) {
        try {
            const result = await API.pickDirectory();
            if (result && result.path) {
                pathInput.value = result.path;

                // パスからフォルダ名を抽出してNameに設定
                const folderName = result.path.split(/[/\\]/).filter(Boolean).pop();
                if (folderName) {
                    nameInput.value = folderName;
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
            pathGroup.style.marginBottom = '8px';

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
            nameGroup.style.marginBottom = '8px';

            const nameLabel = document.createElement('label');
            nameLabel.textContent = 'Name';

            nameGroup.appendChild(nameLabel);
            nameGroup.appendChild(nameInput);

            // --- Actions ---
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger btn-remove-dir';
            removeBtn.dataset.index = index;
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = () => this.removeDirectory(parseInt(removeBtn.dataset.index));

            dirItem.appendChild(pathGroup);
            dirItem.appendChild(nameGroup);
            dirItem.appendChild(removeBtn);

            this.directoriesContainer.appendChild(dirItem);
        });
    }

    addDirectory() {
        this.directories.push({ name: '', path: '' });
        this.renderDirectories();
    }

    removeDirectory(index) {
        this.directories.splice(index, 1);
        this.renderDirectories();
    }

    async save() {
        // Collect directory data from inputs
        const dirItems = this.directoriesContainer.querySelectorAll('.directory-item');
        const newDirectories = [];

        dirItems.forEach(item => {
            const name = item.querySelector('.dir-name').value.trim();
            const path = item.querySelector('.dir-path').value.trim();
            if (name && path) {
                newDirectories.push({ name, path });
            }
        });

        const newConfig = {
            scenario_directories: newDirectories
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
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = document.getElementById('btn-confirm-save');
        if (btnSave) btnSave.onclick = () => this.confirm();
    }

    open(closeAfterSave = false) {
        this.closeAfterSave = closeAfterSave;
        this.inputSubdir.value = '';
        this.inputFilename.value = '';

        // Populate directory dropdown
        const config = this.getConfigCallback();
        this.inputDirType.innerHTML = '';

        if (config.scenario_directories && config.scenario_directories.length > 0) {
            config.scenario_directories.forEach((dir, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = dir.name;
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
        if (btnCancel) btnCancel.onclick = () => { this.close(); if (this.callbacks.onCancel) this.callbacks.onCancel(); };
        if (btnClose) btnClose.onclick = () => { this.close(); if (this.callbacks.onCancel) this.callbacks.onCancel(); };
    }

    open(title, message, callbacks) {
        if (title) this.modal.querySelector('h2').textContent = title;
        if (message) this.modal.querySelector('.modal-body p').textContent = message;
        if (callbacks) this.callbacks = callbacks;
        super.open();
    }
}

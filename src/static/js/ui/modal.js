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
    constructor(saveCallback) {
        super('settings-modal');
        this.inputScenarios = document.getElementById('scenarios-dir');
        this.inputShared = document.getElementById('scenarios-shared-dir');
        this.saveCallback = saveCallback;

        // Settings Events
        const btnOpen = document.getElementById('btn-settings');
        if (btnOpen) btnOpen.onclick = () => this.open();

        const btnClose = this.modal.querySelector('.close-modal');
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) btnSave.onclick = () => this.save();
    }

    open(currentConfig = {}) {
        if (currentConfig.scenarios_dir) this.inputScenarios.value = currentConfig.scenarios_dir;
        if (currentConfig.scenarios_shared_dir) this.inputShared.value = currentConfig.scenarios_shared_dir;
        super.open();
    }

    async save() {
        const newConfig = {
            scenarios_dir: this.inputScenarios.value.trim() || null,
            scenarios_shared_dir: this.inputShared.value.trim() || null
        };
        await this.saveCallback(newConfig);
        this.close();
    }
}

export class SaveAsModal extends BaseModal {
    constructor(saveCallback) {
        super('save-modal');
        this.saveCallback = saveCallback;

        this.inputDirType = document.getElementById('save-dir-type');
        this.inputSubdir = document.getElementById('save-subdir');
        this.inputFilename = document.getElementById('save-filename');

        // Events
        const btnClose = this.modal.querySelector('.close-save-modal');
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = document.getElementById('btn-confirm-save');
        if (btnSave) btnSave.onclick = () => this.confirm();
    }

    open() {
        this.inputSubdir.value = '';
        this.inputFilename.value = '';
        super.open();
        this.inputFilename.focus();
    }

    async confirm() {
        const dirType = this.inputDirType.value;
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
            dirType,
            subdir,
            filename
        });
        this.close();
    }
}

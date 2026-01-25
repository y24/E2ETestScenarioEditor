import { API } from './api.js';
import { FileBrowser } from './ui/file_browser.js';
import { SettingsModal, SaveAsModal, ConfirmModal } from './ui/modal.js';
import { TabManager } from './ui/tabs.js';
import { ScenarioEditor } from './ui/scenario_editor.js';
import { PropertiesPanel } from './ui/properties_panel.js';
import { resizer } from './ui/resizer.js';
import { showToast } from './ui/toast.js';

class App {
    constructor() {
        // Components
        this.fileBrowser = new FileBrowser('file-browser', this.onFileSelected.bind(this));
        this.settingsModal = new SettingsModal(this.onConfigSaved.bind(this), () => this.config);
        this.saveAsModal = new SaveAsModal(this.onSaveAsConfirmed.bind(this), () => this.config);
        this.confirmModal = new ConfirmModal({});

        // Pass callbacks to Editor
        this.editor = new ScenarioEditor(
            'editor-container',
            this.onStepSelected.bind(this), // Step click
            this.onDataChanged.bind(this)   // Step reorder/edit
        );

        this.propertiesPanel = new PropertiesPanel(
            'properties-panel',
            this.onPropertyUpdated.bind(this) // Prop edit
        );

        this.tabManager = new TabManager(
            'tab-bar',
            'editor-container',
            this.onTabChange.bind(this),
            this.onTabCloseRequest.bind(this)
        );

        document.getElementById('btn-refresh-files').onclick = () => this.fileBrowser.load();
        document.getElementById('btn-new-file').onclick = () => this.createNewScenario();
        document.getElementById('btn-save').onclick = () => this.saveCurrentTab();
        document.getElementById('btn-reload').onclick = () => this.reloadCurrentTab();

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentTab();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                this.reloadCurrentTab();
            }
        });

        // Browser Close/Reload Confirmation
        window.onbeforeunload = (e) => {
            if (this.tabManager && this.tabManager.hasDirtyTabs()) {
                e.preventDefault();
                e.returnValue = ''; // Standard way to trigger browser confirmation
                return '';
            }
        };
    }

    async init() {
        try {
            this.config = await API.getConfig();

            // Load Icon Mapping
            const iconsLabel = await fetch('/static/js/ui/icons.json');
            const icons = await iconsLabel.json();
            this.editor.setIcons(icons);

            // Load Action Config
            const actionsLabel = await fetch('/static/js/ui/actions.json');
            const actions = await actionsLabel.json();
            this.propertiesPanel.setActionConfig(actions);

            // Initialize resizer
            await resizer.init();

            if (!this.config.scenario_directories || this.config.scenario_directories.length === 0) {
                this.settingsModal.open(this.config);
            } else {
                this.fileBrowser.load();
            }
        } catch (e) {
            console.error(e);
        }
    }

    // --- Actions ---

    createNewScenario() {
        const timestamp = new Date().toISOString();
        const emptyData = {
            id: "",
            name: "New Scenario",
            description: "",
            setup: [],
            steps: [],
            teardown: []
        };

        // Pseudo file object
        const file = {
            name: "Untitled",
            path: null, // null indicates new file
            parent: "New"
        };

        this.tabManager.openTab(file, emptyData);
    }

    async saveCurrentTab() {
        const tab = this.tabManager.getActiveTab();
        if (!tab) return;

        // If new file (no path), open Save As modal
        if (!tab.file.path) {
            this.saveAsModal.open();
            return;
        }

        // Existing file save
        await this.performSave(tab.file.path, tab.data, tab.id);
    }

    async reloadCurrentTab() {
        const tab = this.tabManager.getActiveTab();
        if (!tab || !tab.file.path) return;

        const doReload = async () => {
            // Visual feedback
            const btn = document.getElementById('btn-reload');
            const originalIcon = '<ion-icon name="refresh-outline"></ion-icon>';
            btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon>';

            try {
                const data = await API.loadScenario(tab.file.path);
                tab.data = data;
                this.tabManager.markDirty(tab.id, false);
                this.onTabChange(tab);

                btn.innerHTML = '<ion-icon name="checkmark-outline" style="color: #2ecc71;"></ion-icon>';
                setTimeout(() => {
                    btn.innerHTML = originalIcon;
                }, 1000);
            } catch (e) {
                alert("Error reloading file: " + e.message);
                btn.innerHTML = '<ion-icon name="alert-circle-outline" style="color: #e74c3c;"></ion-icon>';
                setTimeout(() => {
                    btn.innerHTML = originalIcon;
                }, 2000);
            }
        };

        if (tab.isDirty) {
            this.confirmModal.open(
                '変更の保存',
                `"${tab.file.name}" への変更を保存しますか？`,
                {
                    onYes: async () => {
                        await this.performSave(tab.file.path, tab.data, tab.id);
                        await doReload();
                    },
                    onNo: () => {
                        doReload();
                    },
                    onCancel: () => {
                        // Do nothing
                    }
                }
            );
        } else {
            await doReload();
        }
    }

    async onSaveAsConfirmed({ dirIndex, subdir, filename, closeAfterSave }) {
        // Get directory from config
        if (!this.config.scenario_directories || this.config.scenario_directories.length === 0) {
            alert("No directories configured.");
            return;
        }

        const selectedDir = this.config.scenario_directories[dirIndex];
        if (!selectedDir) {
            alert("Invalid directory selection.");
            return;
        }

        let basePath = selectedDir.path;

        // Simple path join (NOTE: assumes forward slashes or handles via backend normalization, 
        // but for Windows client side path construction, we should be careful. 
        // Best approach is sending components to backend, but let's try simple join)
        let fullPath = basePath;
        if (subdir) fullPath += '/' + subdir;
        fullPath += '/' + filename;

        // Update tab info
        const tab = this.tabManager.getActiveTab();
        if (tab) {
            tab.file.path = fullPath;
            tab.file.name = filename;
            tab.file.parent = subdir || selectedDir.name;

            // Re-render tab to show new name
            this.tabManager.renderTabBar();

            // Perform Save
            await this.performSave(fullPath, tab.data, tab.id);

            // Refresh file list
            this.fileBrowser.load();

            if (closeAfterSave) {
                this.tabManager.forceCloseTab(tab.id);
            }
        }
    }

    async performSave(path, data, tabId) {
        // Visual feedback
        const btn = document.getElementById('btn-save');
        const originalIcon = '<ion-icon name="save-outline"></ion-icon>';
        btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon>';

        try {
            await API.saveScenario(path, data);
            this.tabManager.markDirty(tabId, false);

            // Toast or visual success
            showToast("保存しました");
            btn.innerHTML = '<ion-icon name="checkmark-outline" style="color: #2ecc71;"></ion-icon>';
            setTimeout(() => {
                btn.innerHTML = originalIcon;
            }, 1000);

        } catch (e) {
            alert("Failed to save: " + e.message);
            btn.innerHTML = '<ion-icon name="alert-circle-outline" style="color: #e74c3c;"></ion-icon>';
            setTimeout(() => {
                btn.innerHTML = originalIcon;
            }, 2000);
            throw e;
        }
    }

    async onConfigSaved(newConfig) {
        this.config = await API.saveConfig(newConfig);
        this.fileBrowser.load();
    }

    async onFileSelected(file, isPreview = false) {
        try {
            const data = await API.loadScenario(file.path);
            this.tabManager.openTab(file, data, isPreview);
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    onTabChange(tab) {
        this.editor.render(tab);
        // Clear properties panel when switching tabs
        this.propertiesPanel.render(null);
    }

    onTabCloseRequest(tab) {
        // If it's a dirty tab, ask for confirmation
        this.confirmModal.open(
            '変更の保存',
            `"${tab.file.name}" への変更を保存しますか？`,
            {
                onYes: async () => {
                    // Save and then close
                    if (!tab.file.path) {
                        // For untitled files, we need to activate first so Save As knows which one to save
                        this.tabManager.activateTab(tab.id);
                        this.saveAsModal.open(true);
                    } else {
                        await this.performSave(tab.file.path, tab.data, tab.id);
                        this.tabManager.forceCloseTab(tab.id);
                    }
                },
                onNo: () => {
                    this.tabManager.forceCloseTab(tab.id);
                },
                onCancel: () => {
                    // Do nothing
                }
            }
        );
    }

    onStepSelected(step) {
        this.propertiesPanel.render(step);
    }

    onDataChanged() {
        const tab = this.tabManager.getActiveTab();
        if (tab) {
            this.tabManager.markDirty(tab.id);
        }
    }

    onPropertyUpdated() {
        this.editor.refreshSelectedStep();
        this.onDataChanged();
    }
}

const app = new App();
app.init();

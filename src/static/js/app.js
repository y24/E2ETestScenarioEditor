import { API } from './api.js';
import { FileBrowser } from './ui/file_browser.js';
import { SettingsModal, SaveAsModal } from './ui/modal.js';
import { TabManager } from './ui/tabs.js';
import { ScenarioEditor } from './ui/scenario_editor.js';
import { PropertiesPanel } from './ui/properties_panel.js';

class App {
    constructor() {
        // Components
        this.fileBrowser = new FileBrowser('file-browser', this.onFileSelected.bind(this));
        this.settingsModal = new SettingsModal(this.onConfigSaved.bind(this));
        this.saveAsModal = new SaveAsModal(this.onSaveAsConfirmed.bind(this));

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
            this.onTabChange.bind(this)
        );

        document.getElementById('btn-refresh-files').onclick = () => this.fileBrowser.load();
        document.getElementById('btn-new-file').onclick = () => this.createNewScenario();
        document.getElementById('btn-save').onclick = () => this.saveCurrentTab();

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentTab();
            }
        });
    }

    async init() {
        try {
            this.config = await API.getConfig();
            if (!this.config.scenarios_dir) {
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

    async onSaveAsConfirmed({ dirType, subdir, filename }) {
        // Construct path
        let basePath = "";
        if (dirType === 'scenarios') basePath = this.config.scenarios_dir;
        else if (dirType === 'shared') basePath = this.config.scenarios_shared_dir;

        if (!basePath) {
            alert("Directory path for " + dirType + " is not configured.");
            return;
        }

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
            tab.file.parent = subdir || (dirType === 'scenarios' ? 'Scenarios' : 'Shared');

            // Re-render tab to show new name
            this.tabManager.renderTabBar();

            // Perform Save
            await this.performSave(fullPath, tab.data, tab.id);

            // Refresh file list
            this.fileBrowser.load();
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
        }
    }

    async onConfigSaved(newConfig) {
        this.config = await API.saveConfig(newConfig);
        this.fileBrowser.load();
    }

    async onFileSelected(file) {
        try {
            const data = await API.loadScenario(file.path);
            this.tabManager.openTab(file, data);
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    onTabChange(tab) {
        this.editor.render(tab);
        // Clear properties panel when switching tabs
        this.propertiesPanel.render(null);
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

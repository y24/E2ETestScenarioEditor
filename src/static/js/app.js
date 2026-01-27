import { API } from './api.js';
import { FileBrowser } from './ui/file_browser.js';
import { SettingsModal, SaveAsModal, ConfirmModal, ScenarioMetaModal, RenameModal, GenericConfirmModal, ItemRenameModal } from './ui/modal.js';
import { TargetSelectorModal } from './ui/target_selector_modal.js';
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
        this.targetSelectorModal = new TargetSelectorModal();
        this.metaModal = new ScenarioMetaModal(this.onMetaSaved.bind(this));
        this.renameModal = new RenameModal(this.onFileRenameConfirmed.bind(this));
        this.itemRenameModal = new ItemRenameModal();
        this.genericConfirmModal = new GenericConfirmModal();

        // Explorer Event Handlers
        this.fileBrowser.onRename = (file) => this.renameModal.open(file.path, file.name);
        this.fileBrowser.onDelete = (file) => this.onFileDeleteRequested(file);

        // Pass callbacks to Editor
        this.editor = new ScenarioEditor(
            'editor-container',
            this.onStepSelected.bind(this), // Step click
            this.onDataChanged.bind(this),  // Step reorder/edit
            this.metaModal,                 // Pass modal to editor
            this.itemRenameModal,
            this.genericConfirmModal
        );

        this.propertiesPanel = new PropertiesPanel(
            'properties-panel',
            this.onPropertyUpdated.bind(this), // Prop edit
            this.targetSelectorModal,
            (newConfig) => this.onConfigSaved(newConfig)
        );

        this.tabManager = new TabManager(
            'tab-bar',
            'editor-container',
            this.onTabChange.bind(this),
            this.onTabCloseRequest.bind(this)
        );

        document.getElementById('btn-refresh-files').onclick = () => this.fileBrowser.load();
        document.getElementById('btn-toggle-view').onclick = () => this.toggleFileView();
        document.getElementById('btn-new-file').onclick = () => this.createNewScenario();
        document.getElementById('btn-duplicate-file').onclick = () => this.duplicateSelectedFile();
        document.getElementById('btn-save').onclick = () => this.saveCurrentTab();
        document.getElementById('btn-reload').onclick = () => this.reloadCurrentTab();

        // Save dropdown menu
        const saveDropdownBtn = document.getElementById('btn-save-dropdown');
        const saveDropdownMenu = document.querySelector('.save-dropdown-menu');

        saveDropdownBtn.onclick = (e) => {
            e.stopPropagation();
            saveDropdownMenu.classList.toggle('visible');
        };

        // Save dropdown menu items
        document.querySelectorAll('.save-dropdown-menu .dropdown-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                saveDropdownMenu.classList.remove('visible');

                if (action === 'save-normal') {
                    this.saveCurrentTab();
                } else if (action === 'save-clean') {
                    this.saveCurrentTabWithCleanup();
                }
            };
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            saveDropdownMenu.classList.remove('visible');
        });

        this.fileBrowser.onSelectionChange = (file) => {
            document.getElementById('btn-duplicate-file').disabled = !file;
        };

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
            this.propertiesPanel.setAppConfig(this.config);

            // Apply Saved UI Settings
            if (this.config.ui_settings && this.config.ui_settings.explorerCompactMode) {
                this.fileBrowser.setCompactMode(true);
                const btn = document.getElementById('btn-toggle-view');
                if (btn) btn.title = "詳細表示に切り替え";
            }

            // Load Icon Mapping
            const iconsLabel = await fetch('/static/js/ui/icons.json');
            const icons = await iconsLabel.json();
            this.editor.setIcons(icons);

            // Load Action Parameters Config
            const actionParamsResponse = await fetch('/static/config/action_params.json');
            const actionParams = await actionParamsResponse.json();
            this.propertiesPanel.setActionParamsConfig(actionParams);
            this.editor.setActionParamsConfig(actionParams);

            // Initialize resizer
            await resizer.init();

            if (!this.config.scenario_directories || this.config.scenario_directories.length === 0) {
                this.settingsModal.open(this.config);
            } else {
                this.fileBrowser.load();
            }

            this.updateActionButtons();

            // Window Focus / Tab Switch Events for File Sync
            window.addEventListener('focus', () => this.checkActiveTabForUpdates());
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.checkActiveTabForUpdates();
                }
            });

        } catch (e) {
            console.error(e);
        }
    }

    async checkActiveTabForUpdates() {
        const tab = this.tabManager.getActiveTab();
        if (!tab || !tab.file.path) return;

        try {
            const status = await API.checkFileStatus(tab.file.path);
            const diskModified = status.last_modified;

            if (!tab.lastModified) {
                tab.lastModified = diskModified;
                return;
            }

            // Check if newer (allow small epsilon)
            if (diskModified > tab.lastModified + 0.001) {
                if (!tab.isDirty) {
                    console.log("File changed on disk, auto-reloading...");
                    await this.reloadCurrentTab(true); // silent=true
                    showToast("ファイルを再読み込みしました: " + tab.file.name);
                } else {
                    // Alert user but don't force reload to avoid data loss
                    showToast("警告: このファイルは外部で変更されています", "warning");
                }
            }
        } catch (e) {
            // File might have been deleted or network error
            console.warn("Check status failed:", e);
        }
    }

    // --- Actions ---

    toggleFileView() {
        const isCompact = this.fileBrowser.toggleViewMode();
        const btn = document.getElementById('btn-toggle-view');
        // Update title
        btn.title = isCompact ? "詳細表示に切り替え" : "コンパクト表示に切り替え";

        // Save to config
        if (!this.config.ui_settings) {
            this.config.ui_settings = {};
        }
        this.config.ui_settings.explorerCompactMode = isCompact;

        // Save silently (don't reload file browser)
        API.saveConfig(this.config).then(updated => {
            this.config = updated;
        }).catch(e => console.error("Failed to save view config", e));
    }

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

        // Auto-show meta modal for new scenario
        this.metaModal.open(emptyData);
    }

    async saveCurrentTab() {
        const tab = this.tabManager.getActiveTab();
        if (!tab) return;

        // If new file (no path), open Save As modal
        if (!tab.file.path) {
            const defaultName = tab.data.id ? `${tab.data.id}.json` : '';
            this.saveAsModal.open(defaultName);
            return;
        }

        // Existing file save
        await this.performSave(tab.file.path, tab.data, tab.id);
    }

    async saveCurrentTabWithCleanup() {
        const tab = this.tabManager.getActiveTab();
        if (!tab) return;

        // If new file (no path), open Save As modal
        if (!tab.file.path) {
            showToast("新規ファイルは先に通常保存してください", "error");
            return;
        }

        // Clone data to avoid modifying the current tab's data
        const cleanData = JSON.parse(JSON.stringify(tab.data));

        // Remove metadata from all sections
        ['setup', 'steps', 'teardown'].forEach(section => {
            if (cleanData[section] && Array.isArray(cleanData[section])) {
                cleanData[section].forEach(step => {
                    delete step._stepId;
                });
            }
        });

        // Remove _editor metadata
        delete cleanData._editor;

        // Save the cleaned data
        await this.performSave(tab.file.path, cleanData, tab.id);

        // Show toast notification
        showToast("メタ情報を削除しました");

        // Reload the file to refresh the display
        setTimeout(async () => {
            await this.reloadCurrentTab(true);
        }, 500);
    }

    async duplicateSelectedFile() {
        const selectedFile = this.fileBrowser.selectedFile;
        if (!selectedFile) return;

        try {
            const response = await API.loadScenario(selectedFile.path);
            const data = response.data; // Unwrap

            // Clone data
            const duplicatedData = JSON.parse(JSON.stringify(data));

            // Name should reflect it's a copy
            if (duplicatedData.name) {
                duplicatedData.name += " (Copy)";
            }

            // Pseudo file object for the new (duplicated) tab
            let baseName = selectedFile.name;
            if (baseName.endsWith('.json')) {
                baseName = baseName.slice(0, -5);
            }
            const defaultName = baseName + '_copy';

            const file = {
                name: defaultName,
                path: null, // null indicates new file
                parent: selectedFile.parent
            };

            this.tabManager.openTab(file, duplicatedData);

            // Calculate subdir and dirIndex for SaveAsModal
            const parts = selectedFile.relativePath.split('/');
            parts.pop(); // Remove filename
            const subdir = parts.join('/');
            const dirIndex = selectedFile.dirIndex;

            // Trigger Save As immediately
            this.saveAsModal.open(defaultName + '.json', false, subdir, dirIndex);
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async reloadCurrentTab(silent = false) {
        const tab = this.tabManager.getActiveTab();
        if (!tab || !tab.file.path) return;

        const doReload = async () => {
            // Visual feedback
            const btn = document.getElementById('btn-reload');
            const icon = btn.querySelector('ion-icon');
            const originalName = icon.getAttribute('name');

            if (!silent) icon.setAttribute('name', 'hourglass-outline');

            try {
                const response = await API.loadScenario(tab.file.path);
                tab.data = response.data;
                tab.lastModified = response.last_modified;

                this.tabManager.markDirty(tab.id, false);
                this.onTabChange(tab);

                if (!silent) {
                    icon.setAttribute('name', 'checkmark-outline');
                    icon.style.color = '#2ecc71';
                    setTimeout(() => {
                        icon.setAttribute('name', originalName);
                        icon.style.color = '';
                    }, 1000);
                }
            } catch (e) {
                alert("Error reloading file: " + e.message);
                if (!silent) {
                    icon.setAttribute('name', 'alert-circle-outline');
                    icon.style.color = '#e74c3c';
                    setTimeout(() => {
                        icon.setAttribute('name', originalName);
                        icon.style.color = '';
                    }, 2000);
                }
            }
        };

        if (tab.isDirty && !silent) {
            this.confirmModal.open(
                '変更の保存',
                `"${tab.file.name}" への変更を保存しますか？`,
                {
                    onYes: async () => {
                        try {
                            await this.performSave(tab.file.path, tab.data, tab.id);
                            await doReload();
                        } catch (e) {
                            // Save failed (maybe conflict), stop reload
                        }
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
            // For Save As, we are creating a new file or overwriting. 
            // If overwriting, likely we should warn? 
            // But usually the OS dialog handles that? 
            // Here we don't have OS dialog. Our modal should have checked existence?
            // For now, treat Save As as 'Force Save' effectively since it's a new identity.
            // But technically we should respect conflict if we chose an existing file.
            // Let's pass null for lastModified to enforce no-check? Or just let standard overwrite happen?
            // User intention in Save As is usually explicit overwrite.
            // We'll pass force=true.
            try {
                await this.performSave(fullPath, tab.data, tab.id, true); // Force save

                // Refresh file list
                this.fileBrowser.load();

                if (closeAfterSave) {
                    this.tabManager.forceCloseTab(tab.id);
                } else {
                    this.updateActionButtons();
                }
            } catch (e) {
                // handled in performSave
            }
        }
    }

    async performSave(path, data, tabId, force = false) {
        // Visual feedback
        const btn = document.getElementById('btn-save');
        const icon = btn.querySelector('ion-icon');
        const originalName = icon.getAttribute('name');
        icon.setAttribute('name', 'hourglass-outline');

        const tab = this.tabManager.tabs.find(t => t.id === tabId);
        const lastModified = tab ? tab.lastModified : null;

        try {
            const response = await API.saveScenario(path, data, lastModified, force);

            this.tabManager.markDirty(tabId, false);

            // Update lastModified from response
            if (tab && response.last_modified) {
                tab.lastModified = response.last_modified;
            }

            // Refresh file list to reflect any name changes
            this.fileBrowser.load();

            // Toast or visual success
            showToast("保存しました");
            icon.setAttribute('name', 'checkmark-outline');
            icon.style.color = '#fff'; // On green background, white checkmark is better

            this.updateActionButtons(); // Update button state after save

            setTimeout(() => {
                icon.setAttribute('name', originalName);
                icon.style.color = '';
            }, 1000);

        } catch (e) {
            if (e.status === 409) {
                // Conflict
                icon.setAttribute('name', originalName); // reset icon
                icon.style.color = '';

                this.genericConfirmModal.open(
                    "保存の競合",
                    "このファイルは他のプロセスによって変更されています。\n上書きしますか？",
                    async () => {
                        await this.performSave(path, data, tabId, true);
                    },
                    { confirmText: "上書き", cancelText: "キャンセル", isDanger: true }
                );
                return; // Don't throw, handled.
            }

            alert("Failed to save: " + e.message);
            icon.setAttribute('name', 'alert-circle-outline');
            icon.style.color = '#e74c3c';
            setTimeout(() => {
                icon.setAttribute('name', originalName);
                icon.style.color = '';
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
            const response = await API.loadScenario(file.path);
            const tab = this.tabManager.openTab(file, response.data, isPreview);

            // Force update data and timestamp (in case tab was already open)
            tab.data = response.data;
            tab.lastModified = response.last_modified;

            // If tab was already open, openTab triggers render with old data.
            // We need to re-render with new data.
            this.tabManager.markDirty(tab.id, false);
            this.onTabChange(tab);

        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async onFileRenameConfirmed(oldPath, newName) {
        try {
            const result = await API.renameScenario(oldPath, newName);
            showToast("リネームしました");

            // Update any open tab with this path
            this.tabManager.tabs.forEach(tab => {
                if (tab.file && tab.file.path === oldPath) {
                    tab.file.path = result.newPath;
                    tab.file.name = newName;
                }
            });
            this.tabManager.renderTabBar();

            // Refresh file browser
            this.fileBrowser.load();
        } catch (e) {
            alert("Rename failed: " + e.message);
        }
    }

    onFileDeleteRequested(file) {
        this.genericConfirmModal.open(
            "ファイルの削除",
            `"${file.name}" を削除してもよろしいですか？\nこの操作は取り消せません。`,
            () => this.performDelete(file.path),
            { isDanger: true, confirmText: "削除" }
        );
    }

    async performDelete(path) {
        try {
            await API.deleteScenario(path);
            showToast("削除しました");

            // Close any tab with this path
            const tabToClose = this.tabManager.tabs.find(t => t.file && t.file.path === path);
            if (tabToClose) {
                this.tabManager.forceCloseTab(tabToClose.id);
            }

            // Refresh file browser
            this.fileBrowser.load();
        } catch (e) {
            alert("Delete failed: " + e.message);
        }
    }


    onTabChange(tab) {
        this.editor.render(tab);
        if (tab) {
            // Restore properties panel if a step was selected in this tab
            this.propertiesPanel.render(this.editor.selectedStep);

            // Check for updates when switching to this tab
            this.checkActiveTabForUpdates();
        } else {
            // No tab open, clear properties panel
            this.propertiesPanel.render(null);
        }
        this.updateActionButtons();
    }

    updateActionButtons() {
        const tab = this.tabManager.getActiveTab();
        const btnSave = document.getElementById('btn-save');
        const btnSaveDropdown = document.getElementById('btn-save-dropdown');
        const btnReload = document.getElementById('btn-reload');

        if (!tab) {
            // No tab open: disable all buttons
            btnSave.disabled = true;
            btnSaveDropdown.disabled = true;
            btnReload.disabled = true;
        } else {
            // Tab is open: always enable save buttons (for meta cleanup even when not dirty)
            btnSave.disabled = false;
            btnSaveDropdown.disabled = false;
            // Reload is only enabled if the file has a path (saved on disk)
            btnReload.disabled = !tab.file.path;
        }
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
                        const defaultName = tab.data.id ? `${tab.data.id}.json` : '';
                        this.saveAsModal.open(defaultName, true);
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

    onMetaSaved(updatedData) {
        const tab = this.tabManager.getActiveTab();
        if (tab) {
            tab.data.id = updatedData.id;
            tab.data.name = updatedData.name;
            tab.data.tags = updatedData.tags;
            tab.data.description = updatedData.description;

            this.editor.render(tab);
            this.onDataChanged();
        }
    }

    onDataChanged() {
        const tab = this.tabManager.getActiveTab();
        if (tab) {
            this.tabManager.markDirty(tab.id);
            this.updateActionButtons();
        }
    }

    onPropertyUpdated() {
        this.editor.refreshSelectedStep();
        this.onDataChanged();
    }
}

const app = new App();
app.init();

import { API } from './api.js';
import { FileBrowser } from './ui/file_browser.js';
import { SettingsModal, SaveAsModal, ConfirmModal, ScenarioMetaModal, RenameModal, GenericConfirmModal, ItemRenameModal, SaveTemplateModal, SelectTemplateModal, TemplateEditorModal } from './ui/modal.js';
import { TargetSelectorModal } from './ui/target_selector_modal.js';
import { SharedScenarioSelectorModal } from './ui/shared_scenario_selector_modal.js';
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
        this.sharedScenarioSelectorModal = new SharedScenarioSelectorModal();
        this.metaModal = new ScenarioMetaModal(this.onMetaSaved.bind(this));
        this.renameModal = new RenameModal(this.onFileRenameConfirmed.bind(this));
        this.itemRenameModal = new ItemRenameModal();

        this.genericConfirmModal = new GenericConfirmModal();
        this.saveTemplateModal = new SaveTemplateModal();
        this.selectTemplateModal = new SelectTemplateModal();
        this.templateEditorModal = new TemplateEditorModal();

        // Explorer Event Handlers
        this.fileBrowser.onRename = (file) => this.renameModal.open(file.path, file.name);
        this.fileBrowser.onDelete = (file) => this.onFileDeleteRequested(file);
        this.fileBrowser.onCollapseChange = (dirs) => this.onExplorerCollapseChanged(dirs);

        // Pass callbacks to Editor
        this.editor = new ScenarioEditor(
            'editor-container',
            this.onStepSelected.bind(this), // Step click
            this.onDataChanged.bind(this),  // Step reorder/edit
            this.metaModal,                 // Pass modal to editor
            this.itemRenameModal,
            this.genericConfirmModal,
            this.saveTemplateModal,
            this.selectTemplateModal
        );

        this.propertiesPanel = new PropertiesPanel(
            'properties-panel',
            this.onPropertyUpdated.bind(this), // Prop edit
            this.targetSelectorModal,
            this.sharedScenarioSelectorModal,
            (newConfig) => this.onConfigSaved(newConfig)
        );

        this.tabManager = new TabManager(
            'tab-bar',
            'editor-container',
            this.onTabChange.bind(this),
            this.onTabCloseRequest.bind(this),
            this.saveTabsState.bind(this) // onTabReorder
        );

        document.getElementById('btn-refresh-files').onclick = () => {
            this.fileBrowser.load();
            this.propertiesPanel.loadAvailableSharedScenarios();
            this.propertiesPanel.loadAvailableTargets();
        };
        document.getElementById('btn-toggle-view').onclick = () => this.toggleFileView();
        document.getElementById('btn-new-file').onclick = () => this.createNewScenario();
        document.getElementById('btn-duplicate-file').onclick = () => this.duplicateSelectedFile();
        document.getElementById('btn-save').onclick = () => this.saveCurrentTab();
        document.getElementById('btn-reload').onclick = () => this.reloadCurrentTab();

        document.getElementById('btn-templates').onclick = () => this.templateEditorModal.open();

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
            // Check if any modal is visible
            if (document.querySelector('.modal:not(.hidden)')) {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentTab();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                this.reloadCurrentTab();
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
                const activeTab = this.tabManager.getActiveTab();
                if (activeTab) {
                    e.preventDefault();
                    this.tabManager.closeTab(activeTab.id);
                }
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
            if (this.config.ui_settings && this.config.ui_settings.collapsedDirs) {
                this.fileBrowser.setCollapsedDirs(this.config.ui_settings.collapsedDirs);
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
                this.propertiesPanel.loadAvailableSharedScenarios();
                this.propertiesPanel.loadAvailableTargets();
            }

            // Restore opened tabs
            await this.restoreTabs();

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

    async saveTabsState() {
        if (!this.config.ui_settings) {
            this.config.ui_settings = {};
        }

        const tabsToSave = this.tabManager.tabs
            .filter(t => t.file && t.file.path)
            .map(t => ({
                path: t.file.path,
                isPreview: t.isPreview
            }));

        const activeTab = this.tabManager.getActiveTab();
        const activeTabPath = activeTab ? activeTab.file.path : null;

        this.config.ui_settings.opened_tabs = tabsToSave;
        this.config.ui_settings.active_tab_path = activeTabPath;

        // Save silently
        try {
            await API.saveConfig(this.config);
        } catch (e) {
            console.error("Failed to save tabs state", e);
        }
    }

    async restoreTabs() {
        if (!this.config.ui_settings || !this.config.ui_settings.opened_tabs) return;

        const tabs = this.config.ui_settings.opened_tabs;
        const activePath = this.config.ui_settings.active_tab_path;

        for (const tabInfo of tabs) {
            try {
                // Check if file exists and load it
                const response = await API.loadScenario(tabInfo.path);

                // Construct basic file object
                // We try to find the full file info from fileBrowser if loaded, 
                // but if not, we create a minimal one.
                let fileObj = {
                    path: tabInfo.path,
                    name: tabInfo.path.split(/[/\\]/).pop(),
                    parent: ""
                };

                const tab = this.tabManager.openTab(fileObj, response.data, tabInfo.isPreview);
                tab.lastModified = response.last_modified;
                tab.hasOrgEditorMeta = !!response.data._editor;

            } catch (e) {
                console.warn(`Failed to restore tab: ${tabInfo.path}`, e);
                // Ignore errors as requested
            }
        }

        if (activePath) {
            // Find tab with this path
            const tabToActivate = this.tabManager.tabs.find(t => t.file.path === activePath);
            if (tabToActivate) {
                this.tabManager.activateTab(tabToActivate.id);
            }
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

    onExplorerCollapseChanged(dirs) {
        if (!this.config.ui_settings) {
            this.config.ui_settings = {};
        }
        this.config.ui_settings.collapsedDirs = dirs;

        // Save silently
        API.saveConfig(this.config).then(updated => {
            this.config = updated;
        }).catch(e => console.error("Failed to save collapse config", e));
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

        const tab = this.tabManager.openTab(file, emptyData);
        tab.hasOrgEditorMeta = false;

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

        this.genericConfirmModal.open(
            "メタ情報の削除",
            "ステップのグループ化状態や、内部ID等のメタ情報を削除して保存しますか？",
            async () => {
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
            },
            { confirmText: "削除して保存", isDanger: true }
        );
    }

    async duplicateSelectedFile() {
        const selectedFile = this.fileBrowser.selectedFile;
        if (!selectedFile) return;

        try {
            const response = await API.loadScenario(selectedFile.path);
            const data = response.data;

            // Clone data
            const duplicatedData = JSON.parse(JSON.stringify(data));

            // Name should reflect it's a copy
            if (duplicatedData.name) {
                duplicatedData.name += " (Copy)";
            }

            let baseName = selectedFile.name;
            if (baseName.endsWith('.json')) {
                baseName = baseName.slice(0, -5);
            }
            const defaultName = baseName + '_copy';

            // Calculate subdir and dirIndex for SaveAsModal
            const parts = (selectedFile.relativePath || "").split(/[/\\]/);
            parts.pop(); // Remove filename
            const subdir = parts.join('/');

            // Determine corect dirIndex for SaveAsModal
            // FileBrowser uses index from API response list. 
            // If index >= config.scenario_directories.length, it is likely the shared directory.
            let dirIndex = selectedFile.dirIndex;
            const configDirsCount = (this.config.scenario_directories || []).length;

            if (dirIndex >= configDirsCount) {
                // Assuming it's the shared directory appended at the end
                dirIndex = -1;
            }

            // Trigger Save As without opening a tab
            this.saveAsModal.open(
                defaultName + '.json',
                false,
                subdir,
                dirIndex,
                null, // onCancel
                async (result) => {
                    const { dirIndex, subdir, filename } = result;
                    const selectedDir = this.config.scenario_directories[dirIndex];
                    let fullPath = selectedDir.path;
                    if (subdir) {
                        const separator = fullPath.includes('\\') ? '\\' : '/';
                        fullPath += separator + subdir;
                    }
                    const separator = fullPath.includes('\\') ? '\\' : '/';
                    fullPath += separator + filename;

                    try {
                        await API.saveScenario(fullPath, duplicatedData, null, true); // force=true for new file
                        showToast("ファイルを複製しました");
                        this.fileBrowser.load();
                    } catch (e) {
                        alert("複製に失敗しました: " + e.message);
                    }
                }
            );
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
                tab.hasOrgEditorMeta = !!response.data._editor;

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
        let selectedDir;
        if (dirIndex === -1) {
            if (!this.config.shared_scenario_dir) {
                alert("Shared scenario directory is not configured.");
                return;
            }
            selectedDir = { path: this.config.shared_scenario_dir, name: "scenarios_shared" };
        } else {
            if (!this.config.scenario_directories || this.config.scenario_directories.length === 0) {
                alert("No directories configured.");
                return;
            }
            selectedDir = this.config.scenario_directories[dirIndex];
        }

        if (!selectedDir) {
            alert("Invalid directory selection.");
            return;
        }

        let fullPath = basePath;
        if (subdir) {
            const separator = fullPath.includes('\\') ? '\\' : '/';
            fullPath += separator + subdir;
        }
        const separator = fullPath.includes('\\') ? '\\' : '/';
        fullPath += separator + filename;

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

    async performSave(path, data, tabId, force = false, metaConfirmed = false) {
        // Visual feedback
        const btn = document.getElementById('btn-save');
        const icon = btn.querySelector('ion-icon');
        const originalName = icon.getAttribute('name');
        icon.setAttribute('name', 'hourglass-outline');

        const tab = this.tabManager.tabs.find(t => t.id === tabId);
        const lastModified = tab ? tab.lastModified : null;

        // Check if grouping is used. If not, remove metadata.
        let dataToSave = data;
        let hasGroups = false;
        if (data._editor && data._editor.sections) {
            for (const section of ['setup', 'steps', 'teardown']) {
                if (data._editor.sections[section] &&
                    data._editor.sections[section].groups &&
                    Object.keys(data._editor.sections[section].groups).length > 0) {
                    hasGroups = true;
                    break;
                }
            }
        }

        // Confirm before adding metadata if not present originally
        if (hasGroups && tab && !tab.hasOrgEditorMeta && !metaConfirmed) {
            // Reset icon
            icon.setAttribute('name', originalName);
            icon.style.color = '';

            this.genericConfirmModal.open(
                "メタ情報の追加",
                "グループ化情報を保存するために、ファイルにメタ情報（_editor）を追加します。よろしいですか？\n追加された情報は、「メタ情報を削除して保存」を選択して再保存することで削除されます。",
                () => {
                    // Recursive call with confirmation
                    this.performSave(path, data, tabId, force, true);
                },
                { confirmText: "保存して追加", cancelText: "キャンセル" }
            );
            return;
        }

        if (!hasGroups) {
            dataToSave = JSON.parse(JSON.stringify(data));
            ['setup', 'steps', 'teardown'].forEach(section => {
                if (dataToSave[section] && Array.isArray(dataToSave[section])) {
                    dataToSave[section].forEach(step => {
                        delete step._stepId;
                    });
                }
            });
            delete dataToSave._editor;
        }

        try {
            const response = await API.saveScenario(path, dataToSave, lastModified, force);

            this.tabManager.markDirty(tabId, false);

            // Update lastModified from response
            if (tab && response.last_modified) {
                tab.lastModified = response.last_modified;
            }
            if (tab) {
                tab.hasOrgEditorMeta = !!dataToSave._editor;
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
                        await this.performSave(path, data, tabId, true, metaConfirmed);
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
        this.propertiesPanel.loadAvailableSharedScenarios();
        this.propertiesPanel.loadAvailableTargets();
    }

    async onFileSelected(file, isPreview = false) {
        try {
            const response = await API.loadScenario(file.path);
            const tab = this.tabManager.openTab(file, response.data, isPreview);

            // Force update data and timestamp (in case tab was already open)
            tab.data = response.data;
            tab.lastModified = response.last_modified;
            tab.hasOrgEditorMeta = !!response.data._editor;

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

            // Synchronize explorer highlight
            this.fileBrowser.selectFileByPath(tab.file ? tab.file.path : null);

            // Check for updates when switching to this tab
            this.checkActiveTabForUpdates();
        } else {
            // No tab open, clear properties panel
            this.propertiesPanel.render(null);
            this.fileBrowser.selectFileByPath(null);
        }
        this.updateActionButtons();
        this.saveTabsState();
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

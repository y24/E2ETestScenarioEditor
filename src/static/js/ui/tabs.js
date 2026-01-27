export class TabManager {
    constructor(tabBarId, editorContainerId, onTabChange, onTabCloseRequest) {
        this.tabBar = document.getElementById(tabBarId);
        this.editorContainer = document.getElementById(editorContainerId);
        this.tabs = []; // { id: str, file: Obj, data: Obj, isDirty: bool }
        this.activeTabId = null;
        this.onTabChange = onTabChange;
        this.onTabCloseRequest = onTabCloseRequest;
    }

    openTab(file, data, isPreview = false) {
        // Check if already open
        const existing = this.tabs.find(t => t.file.path === file.path);
        if (existing) {
            // If it's a preview and we now want it permanent
            if (existing.isPreview && !isPreview) {
                existing.isPreview = false;
            }
            this.activateTab(existing.id);
            return existing;
        }

        // If it's a preview request, check if there's already a preview tab
        if (isPreview) {
            const previewTab = this.tabs.find(t => t.isPreview);
            if (previewTab) {
                // Reuse the preview tab slot
                previewTab.file = file;
                previewTab.data = data;
                previewTab.isDirty = false;
                delete previewTab.uiState; // Reset UI state for new file
                this.activateTab(previewTab.id);
                return previewTab;
            }
        }

        const tab = {
            id: 'tab-' + Date.now(),
            file: file,
            data: data,
            isDirty: false,
            isPreview: isPreview
        };

        this.tabs.push(tab);
        this.renderTabBar();
        this.activateTab(tab.id);
        return tab;
    }

    activateTab(tabId) {
        this.activeTabId = tabId;
        this.renderTabBar();

        const tab = this.tabs.find(t => t.id === tabId);
        if (tab && this.onTabChange) {
            this.onTabChange(tab);
        }
    }

    closeTab(tabId, e) {
        if (e) e.stopPropagation();

        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        if (tab.isDirty && this.onTabCloseRequest) {
            this.onTabCloseRequest(tab);
            return;
        }

        this.forceCloseTab(tabId);
    }

    forceCloseTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        this.tabs.splice(index, 1);

        if (this.tabs.length === 0) {
            this.activeTabId = null;
            this.renderTabBar();
            if (this.onTabChange) this.onTabChange(null);
        } else if (this.activeTabId === tabId) {
            // Activate previous tab
            this.activateTab(this.tabs[Math.max(0, index - 1)].id);
        } else {
            this.renderTabBar();
        }
    }

    renderTabBar() {
        this.tabBar.innerHTML = '';
        this.tabs.forEach(tab => {
            const el = document.createElement('div');
            el.className = `tab-item ${tab.id === this.activeTabId ? 'active' : ''} ${tab.isPreview ? 'preview' : ''}`;
            el.innerHTML = `
                <span class="tab-label">${tab.file.name}</span>
                <span class="tab-close">&times;</span>
            `;
            if (tab.isDirty) {
                el.classList.add('dirty');
            }

            el.onclick = () => this.activateTab(tab.id);
            el.querySelector('.tab-close').onclick = (e) => this.closeTab(tab.id, e);

            this.tabBar.appendChild(el);

            if (tab.id === this.activeTabId) {
                requestAnimationFrame(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                });
            }
        });
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    hasDirtyTabs() {
        return this.tabs.some(t => t.isDirty);
    }

    markDirty(tabId, isDirty = true) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.isDirty = isDirty;
            if (isDirty) {
                tab.isPreview = false;
            }
            this.renderTabBar();
        }
    }
}

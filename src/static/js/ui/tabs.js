export class TabManager {
    constructor(tabBarId, editorContainerId, onTabChange) {
        this.tabBar = document.getElementById(tabBarId);
        this.editorContainer = document.getElementById(editorContainerId);
        this.tabs = []; // { id: str, file: Obj, data: Obj, isDirty: bool }
        this.activeTabId = null;
        this.onTabChange = onTabChange;
    }

    openTab(file, data) {
        // Check if already open
        const existing = this.tabs.find(t => t.file.path === file.path);
        if (existing) {
            this.activateTab(existing.id);
            return existing;
        }

        const tab = {
            id: 'tab-' + Date.now(),
            file: file,
            data: data,
            isDirty: false
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

        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        // TODO: Check dirty state and confirm

        this.tabs.splice(index, 1);

        if (this.tabs.length === 0) {
            this.activeTabId = null;
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
            el.className = `tab-item ${tab.id === this.activeTabId ? 'active' : ''}`;
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
        });
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    markDirty(tabId, isDirty = true) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.isDirty = isDirty;
            this.renderTabBar();
        }
    }
}

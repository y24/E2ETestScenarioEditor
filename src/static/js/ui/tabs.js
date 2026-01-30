export class TabManager {
    constructor(tabBarId, editorContainerId, onTabChange, onTabCloseRequest, onTabReorder) {
        this.tabBar = document.getElementById(tabBarId);
        this.editorContainer = document.getElementById(editorContainerId);
        this.tabs = []; // { id: str, file: Obj, data: Obj, isDirty: bool }
        this.activeTabId = null;
        this.onTabChange = onTabChange;
        this.onTabCloseRequest = onTabCloseRequest;
        this.onTabReorder = onTabReorder;
    }

    openTab(file, data, isPreview = false) {
        const normalize = (path) => path ? path.replace(/\\/g, '/') : path;
        const normalizedPath = normalize(file.path);
        const existing = this.tabs.find(t => normalize(t.file.path) === normalizedPath);
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
            if (this.onTabReorder) this.onTabReorder();
        }
    }

    renderTabBar() {
        this.tabBar.innerHTML = '';
        this.tabs.forEach((tab, index) => {
            const el = document.createElement('div');
            el.className = `tab-item ${tab.id === this.activeTabId ? 'active' : ''} ${tab.isPreview ? 'preview' : ''}`;
            el.setAttribute('draggable', 'true');
            el.dataset.id = tab.id;
            el.dataset.index = index;

            el.innerHTML = `
                <span class="tab-label">${tab.file.name}</span>
                <span class="tab-close">&times;</span>
            `;
            if (tab.isDirty) {
                el.classList.add('dirty');
            }

            el.onclick = () => this.activateTab(tab.id);
            el.querySelector('.tab-close').onclick = (e) => this.closeTab(tab.id, e);

            // Drag and Drop handlers
            el.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', tab.id);
                // Set the drag image to be the element itself
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => el.classList.add('dragging'), 0);
            };

            el.ondragend = () => {
                el.classList.remove('dragging');
                const dragOvers = this.tabBar.querySelectorAll('.drag-over');
                dragOvers.forEach(item => item.classList.remove('drag-over'));
            };

            el.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-over');
            };

            el.ondragleave = () => {
                el.classList.remove('drag-over');
            };

            el.ondrop = (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId !== tab.id) {
                    this.moveTab(draggedId, tab.id);
                }
            };

            this.tabBar.appendChild(el);

            if (tab.id === this.activeTabId) {
                requestAnimationFrame(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                });
            }
        });
    }

    moveTab(fromId, toId) {
        const fromIndex = this.tabs.findIndex(t => t.id === fromId);
        const toIndex = this.tabs.findIndex(t => t.id === toId);
        if (fromIndex !== -1 && toIndex !== -1) {
            const [movedTab] = this.tabs.splice(fromIndex, 1);
            this.tabs.splice(toIndex, 0, movedTab);
            this.renderTabBar();
            if (this.onTabReorder) this.onTabReorder();
        }
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

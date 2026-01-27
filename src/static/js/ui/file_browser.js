import { API } from '../api.js';

export class FileBrowser {
    constructor(containerId, onFileSelect) {
        this.container = document.getElementById(containerId);
        this.onFileSelect = onFileSelect;
        this.onSelectionChange = null; // Callback for when selection changes
        this.onRename = null;
        this.onDelete = null;
        this.selectedFile = null;
        this.data = null; // Store raw data
        this.searchQuery = '';
        this.collapsedDirs = new Set(); // Keep track of collapsed directories
        this.isCompact = false;

        this.initSearch();
    }

    toggleViewMode() {
        this.isCompact = !this.isCompact;
        this.container.classList.toggle('compact-view', this.isCompact);
        return this.isCompact;
    }

    setCompactMode(isCompact) {
        this.isCompact = isCompact;
        this.container.classList.toggle('compact-view', this.isCompact);
    }

    initSearch() {
        const searchInput = document.getElementById('explorer-search-input');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderFiltered();
            };
        }
    }

    async load() {
        this.container.innerHTML = '<div class="loading">Loading...</div>';
        try {
            this.data = await API.listFiles();
            this.renderFiltered();
        } catch (e) {
            this.container.innerHTML = `<div class="error">Error: ${e.message}</div>`;
        }
    }

    renderFiltered() {
        if (!this.data) return;

        // Filter data based on searchQuery
        const filteredData = {
            directories: this.data.directories.map((dir, dirIndex) => {
                return {
                    name: dir.name,
                    dirIndex: dirIndex,
                    files: dir.files.map(file => ({ ...file, dirIndex })).filter(file =>
                        file.name.toLowerCase().includes(this.searchQuery) ||
                        (file.parent && file.parent.toLowerCase().includes(this.searchQuery)) ||
                        (file.scenarioName && file.scenarioName.toLowerCase().includes(this.searchQuery))
                    )
                };
            }).filter(dir => dir.files.length > 0)
        };

        this.render(filteredData);
    }

    render(data) {
        this.container.innerHTML = '';

        if (!data.directories || data.directories.length === 0) {
            const msg = this.searchQuery
                ? `No files matching "${this.searchQuery}"`
                : 'No directories configured. Check settings.';
            this.container.innerHTML = `<div class="empty-message" style="padding: 20px; text-align: center; color: #999; font-size: 0.9rem;">${msg}</div>`;
            return;
        }

        data.directories.forEach((directory, index) => {
            this.renderSection(directory.name, directory.files);
        });
    }

    renderSection(title, files) {
        // 検索クエリがある場合は展開した状態にする。そうでない場合は、保存されている折りたたみ状態に従う。
        const isCollapsed = this.collapsedDirs.has(title) && !this.searchQuery;

        const header = document.createElement('div');
        header.className = `section-header ${isCollapsed ? 'collapsed' : ''}`;
        header.innerHTML = `
            <ion-icon name="chevron-down-outline"></ion-icon>
            <span>${title}</span>
        `;

        const content = document.createElement('div');
        content.className = `section-content ${isCollapsed ? 'collapsed' : ''}`;

        header.onclick = () => {
            const nowCollapsed = !content.classList.contains('collapsed');
            header.classList.toggle('collapsed', nowCollapsed);
            content.classList.toggle('collapsed', nowCollapsed);

            if (nowCollapsed) {
                this.collapsedDirs.add(title);
            } else {
                this.collapsedDirs.delete(title);
            }
        };

        this.container.appendChild(header);
        this.container.appendChild(content);

        files.forEach(file => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.style.paddingLeft = '32px'; // Indent files under folder
            el.innerHTML = `
                <ion-icon name="document-text-outline" class="file-icon"></ion-icon>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-scenario-name">${file.scenarioName || ''}</div>
                </div>
                <div class="file-actions">
                    <button class="btn-action btn-rename" title="リネーム"><ion-icon name="create-outline"></ion-icon></button>
                    <button class="btn-action btn-delete" title="削除"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
            `;
            el.onclick = (e) => {
                e.stopPropagation();
                // Highlight selection
                this.container.querySelectorAll('.file-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.selectedFile = file;
                if (this.onSelectionChange) this.onSelectionChange(file);
                this.onFileSelect(file, true); // true = isPreview
            };
            el.ondblclick = (e) => {
                e.stopPropagation();
                this.onFileSelect(file, false); // false = not preview
            };

            const btnRename = el.querySelector('.btn-rename');
            btnRename.onclick = (e) => {
                e.stopPropagation();
                if (this.onRename) this.onRename(file);
            };

            const btnDelete = el.querySelector('.btn-delete');
            btnDelete.onclick = (e) => {
                e.stopPropagation();
                if (this.onDelete) this.onDelete(file);
            };

            content.appendChild(el);
        });

    }
}

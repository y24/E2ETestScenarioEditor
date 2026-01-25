import { API } from '../api.js';

export class FileBrowser {
    constructor(containerId, onFileSelect) {
        this.container = document.getElementById(containerId);
        this.onFileSelect = onFileSelect;
        this.data = null; // Store raw data
        this.searchQuery = '';
        this.collapsedDirs = new Set(); // Keep track of collapsed directories

        this.initSearch();
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
            directories: this.data.directories.map(dir => {
                return {
                    name: dir.name,
                    files: dir.files.filter(file =>
                        file.name.toLowerCase().includes(this.searchQuery) ||
                        (file.parent && file.parent.toLowerCase().includes(this.searchQuery))
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
                    <div class="file-path" style="font-size:0.75rem; color:#999;">${file.parent}</div>
                </div>
            `;
            el.onclick = (e) => {
                e.stopPropagation();
                // Highlight selection
                this.container.querySelectorAll('.file-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.onFileSelect(file, true); // true = isPreview
            };
            el.ondblclick = (e) => {
                e.stopPropagation();
                this.onFileSelect(file, false); // false = not preview
            };
            content.appendChild(el);
        });
    }
}

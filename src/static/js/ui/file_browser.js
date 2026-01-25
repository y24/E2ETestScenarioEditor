import { API } from '../api.js';

export class FileBrowser {
    constructor(containerId, onFileSelect) {
        this.container = document.getElementById(containerId);
        this.onFileSelect = onFileSelect;
        this.data = null; // Store raw data
        this.searchQuery = '';

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
            if (index > 0) {
                const sep = document.createElement('div');
                sep.style.height = '16px';
                this.container.appendChild(sep);
            }
            this.renderSection(directory.name, directory.files);
        });
    }

    renderSection(title, files) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.style.padding = '8px 16px';
        header.style.fontWeight = 'bold';
        header.style.color = '#666';
        header.style.fontSize = '0.8rem';
        header.textContent = title;
        this.container.appendChild(header);

        files.forEach(file => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.innerHTML = `
                <ion-icon name="document-text-outline" class="file-icon"></ion-icon>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-path" style="font-size:0.75rem; color:#999;">${file.parent}</div>
                </div>
            `;
            el.onclick = () => {
                // Highlight selection
                this.container.querySelectorAll('.file-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.onFileSelect(file, true); // true = isPreview
            };
            el.ondblclick = () => {
                this.onFileSelect(file, false); // false = not preview
            };
            this.container.appendChild(el);
        });
    }
}

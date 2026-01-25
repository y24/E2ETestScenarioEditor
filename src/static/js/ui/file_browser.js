import { API } from '../api.js';

export class FileBrowser {
    constructor(containerId, onFileSelect) {
        this.container = document.getElementById(containerId);
        this.onFileSelect = onFileSelect;
    }

    async load() {
        this.container.innerHTML = '<div class="loading">Loading...</div>';
        try {
            const data = await API.listFiles();
            this.render(data);
        } catch (e) {
            this.container.innerHTML = `<div class="error">Error: ${e.message}</div>`;
        }
    }

    render(data) {
        this.container.innerHTML = '';

        // Render Scenarios
        if (data.scenarios && data.scenarios.length > 0) {
            this.renderSection('Scenarios', data.scenarios);
        } else {
            this.container.innerHTML += '<div class="empty-message">No scenarios found. Check settings.</div>';
        }

        // Render Shared Scenarios
        if (data.shared && data.shared.length > 0) {
            const sep = document.createElement('div');
            sep.style.height = '16px';
            this.container.appendChild(sep);
            this.renderSection('Shared Scenarios', data.shared);
        }
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
                this.onFileSelect(file);
            };
            this.container.appendChild(el);
        });
    }
}

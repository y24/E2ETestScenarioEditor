import { BaseModal } from './modal.js';
import { API } from '../api.js';

export class SharedScenarioSelectorModal extends BaseModal {
    constructor(onSelect) {
        let modalId = 'shared-scenario-selector-modal';
        if (!document.getElementById(modalId)) {
            const modalHtml = `
            <div id="${modalId}" class="modal hidden">
                <div class="modal-content" style="max-height: 80vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <h2>Select Shared Scenario</h2>
                        <span class="close-modal close-shared-selector-modal">&times;</span>
                    </div>
                    <div class="modal-body" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                        <input type="text" id="shared-search" class="form-input" placeholder="Search scenarios..." style="margin-bottom: 10px;" autocomplete="off">
                        <div id="shared-list" style="flex: 1; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                            <!-- Items will be injected here -->
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary close-shared-selector-modal">Cancel</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        super(modalId);
        this.onSelect = onSelect;
        this.files = [];

        // Events
        const closeBtns = this.modal.querySelectorAll('.close-shared-selector-modal');
        closeBtns.forEach(btn => btn.onclick = () => this.cancel());

        this.searchInput = document.getElementById('shared-search');
        this.searchInput.oninput = () => this.renderList();

        this.listContainer = document.getElementById('shared-list');
    }

    async open(currentValue, onSelectCallback) {
        if (onSelectCallback) {
            this.onSelect = onSelectCallback;
        }

        this.listContainer.innerHTML = '<div style="padding:10px;">Loading...</div>';
        this.searchInput.value = '';
        super.open();

        try {
            const data = await API.listFiles();
            // Find "scenarios_shared" directory
            const sharedDir = data.directories.find(d => d.name === 'scenarios_shared');

            if (sharedDir) {
                // Filter only json files
                this.files = sharedDir.files.filter(f => f.name.endsWith('.json'));
            } else {
                this.files = [];
            }

            this.renderList();
            this.searchInput.focus();
        } catch (e) {
            this.listContainer.innerHTML = `<div style="padding:10px; color:red;">Error loading files: ${e.message}</div>`;
        }
    }

    renderList() {
        const query = this.searchInput.value.toLowerCase();
        const filtered = this.files.filter(f =>
            f.name.toLowerCase().includes(query) ||
            (f.relativePath && f.relativePath.toLowerCase().includes(query))
        );

        this.listContainer.innerHTML = '';

        if (filtered.length === 0) {
            if (this.files.length === 0) {
                this.listContainer.innerHTML = '<div style="padding:10px; color:#888;">No shared scenarios found. Check settings.</div>';
            } else {
                this.listContainer.innerHTML = '<div style="padding:10px; color:#888;">No matches found.</div>';
            }
            return;
        }

        filtered.forEach(file => {
            const div = document.createElement('div');
            div.className = 'target-item'; // Reuse style
            div.style.padding = '8px 12px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid #eee';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';

            div.onmouseover = () => div.style.backgroundColor = '#f5f5f5';
            div.onmouseout = () => div.style.backgroundColor = 'transparent';

            div.onclick = () => {
                if (this.onSelect) {
                    // Use relativePath. 
                    // Note: relativePath usually includes filename? Yes.
                    // If shared dir is C:/Shared and file is C:/Shared/Sub/foo.json, relativePath is likely Sub/foo.json (or normalized).
                    // We want relative to shared root.
                    // The backend list_files returns relativePath relative to the root provided.
                    // So it should be correct.
                    this.onSelect(file.relativePath);
                }
                this.close();
            };

            const fileName = document.createElement('span');
            fileName.style.fontWeight = '500';
            fileName.textContent = file.name;

            div.appendChild(fileName);

            if (file.relativePath && file.relativePath !== file.name) {
                const pathNode = document.createElement('span');
                pathNode.style.fontSize = '0.85em';
                pathNode.style.color = '#666';
                pathNode.textContent = file.relativePath;
                div.appendChild(pathNode);
            }

            this.listContainer.appendChild(div);
        });
    }
}

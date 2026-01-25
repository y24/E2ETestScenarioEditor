import { BaseModal } from './modal.js';
import { API } from '../api.js';

export class TargetSelectorModal extends BaseModal {
    constructor(onSelect) {
        // We need to create the modal structure dynamically first if it doesn't exist
        // or assume it's in the HTML. For this app, it seems modals are in HTML.
        // But since this is a new feature, I should check if I need to inject HTML or if I can create it dynamically.
        // BaseModal takes an ID. I will inject the HTML for this modal into the document first.

        let modalId = 'target-selector-modal';
        if (!document.getElementById(modalId)) {
            const modalHtml = `
            <div id="${modalId}" class="modal hidden">
                <div class="modal-content" style="max-height: 80vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <h2>Select Target</h2>
                        <span class="close-modal close-target-selector-modal">&times;</span>
                    </div>
                    <div class="modal-body" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                        <input type="text" id="target-search" class="form-input" placeholder="Search targets..." style="margin-bottom: 10px;" autocomplete="off">
                        <div id="target-list" style="flex: 1; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                            <!-- Items will be injected here -->
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary close-target-selector-modal">Cancel</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        super(modalId);
        this.onSelect = onSelect;
        this.targets = [];

        // Events
        const closeBtns = this.modal.querySelectorAll('.close-target-selector-modal');
        closeBtns.forEach(btn => btn.onclick = () => this.cancel());

        this.searchInput = document.getElementById('target-search');
        this.searchInput.oninput = () => this.renderList();

        this.listContainer = document.getElementById('target-list');
    }

    async open(currentValue, onSelectCallback) {
        if (onSelectCallback) {
            this.onSelect = onSelectCallback;
        }

        // Show loading state
        this.listContainer.innerHTML = '<div style="padding:10px;">Loading...</div>';
        super.open();

        try {
            this.targets = await API.getPageObjects();
            this.renderList();
            this.searchInput.focus();
        } catch (e) {
            this.listContainer.innerHTML = `<div style="padding:10px; color:red;">Error loading targets: ${e.message}</div>`;
        }
    }

    renderList() {
        const query = this.searchInput.value.toLowerCase();
        const filtered = this.targets.filter(t => t.target.toLowerCase().includes(query));

        this.listContainer.innerHTML = '';

        if (filtered.length === 0) {
            this.listContainer.innerHTML = '<div style="padding:10px; color:#888;">No targets found.</div>';
            return;
        }

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'target-item';
            div.style.padding = '8px 12px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid #eee';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';

            div.onmouseover = () => div.style.backgroundColor = '#f5f5f5';
            div.onmouseout = () => div.style.backgroundColor = 'transparent';

            div.onclick = () => {
                if (this.onSelect) {
                    this.onSelect(item.target);
                }
                this.close();
            };

            const targetName = document.createElement('span');
            targetName.style.fontWeight = '500';
            targetName.textContent = item.target;

            div.appendChild(targetName);

            if (item.doc) {
                const docNode = document.createElement('span');
                docNode.style.fontSize = '0.85em';
                docNode.style.color = '#666';
                docNode.textContent = item.doc.split('\n')[0]; // First line of docstring
                div.appendChild(docNode);
            }

            this.listContainer.appendChild(div);
        });
    }
}

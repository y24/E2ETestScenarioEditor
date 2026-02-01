import { apiClient } from '../api.js';

/**
 * Resizer module for handling pane resizing
 */
export class Resizer {
    constructor() {
        this.isResizing = false;
        this.currentResizer = null;
        this.startX = 0;
        this.startWidth = 0;
        this.targetPane = null;
        this.config = null;
        this.preMinimizeWidth = 300;
        this.side = null;
    }

    /**
     * Initialize resizers
     */
    async init() {
        // Load config to get saved widths
        await this.loadConfig();

        // Apply saved widths
        this.applySavedWidths();

        // Setup left resizer
        const resizerLeft = document.getElementById('resizer-left');
        if (resizerLeft) {
            resizerLeft.addEventListener('mousedown', (e) => this.startResize(e, 'left'));
        }

        this.setupMinimizeButtons();

        // Setup right resizer
        const resizerRight = document.getElementById('resizer-right');
        if (resizerRight) {
            resizerRight.addEventListener('mousedown', (e) => this.startResize(e, 'right'));
        }

        // Global mouse events
        document.addEventListener('mousemove', (e) => this.resize(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }

    /**
     * Load config from backend
     */
    async loadConfig() {
        try {
            this.config = await apiClient.getConfig();
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = { ui_settings: {} };
        }
    }

    /**
     * Apply saved widths from config
     */
    applySavedWidths() {
        if (!this.config || !this.config.ui_settings) return;

        const leftPane = document.querySelector('.pane-left');
        const rightPane = document.querySelector('.pane-right');

        if (this.config.ui_settings.paneLeftWidth && leftPane) {
            leftPane.style.width = `${this.config.ui_settings.paneLeftWidth}px`;
            this.preMinimizeWidth = this.config.ui_settings.paneLeftWidth;
        }

        if (this.config.ui_settings.paneLeftMinimized && leftPane) {
            this.toggleMinimizeExplorer(true, false); // don't save when applying
        }

        if (this.config.ui_settings.paneRightWidth && rightPane) {
            rightPane.style.width = `${this.config.ui_settings.paneRightWidth}px`;
        }
    }

    /**
     * Setup minimize/restore buttons
     */
    setupMinimizeButtons() {
        const btnMinimize = document.getElementById('btn-minimize-explorer');
        const btnRestore = document.getElementById('btn-restore-explorer');

        if (btnMinimize) {
            btnMinimize.onclick = () => this.toggleMinimizeExplorer(true);
        }
        if (btnRestore) {
            btnRestore.onclick = () => this.toggleMinimizeExplorer(false);
        }
    }

    /**
     * Toggle Explorer minimized state
     */
    async toggleMinimizeExplorer(isMinimized, shouldSave = true) {
        const leftPane = document.querySelector('.pane-left');
        if (!leftPane) return;

        if (isMinimized) {
            if (!leftPane.classList.contains('minimized')) {
                this.preMinimizeWidth = leftPane.offsetWidth;
            }
            leftPane.classList.add('minimized');
        } else {
            leftPane.classList.remove('minimized');
            leftPane.style.width = `${this.preMinimizeWidth || 300}px`;
        }

        if (shouldSave) {
            await this.saveMinimizeState(isMinimized);
        }
    }

    async saveMinimizeState(isMinimized) {
        const updateData = {
            ui_settings: {
                paneLeftMinimized: isMinimized
            }
        };

        if (!isMinimized) {
            updateData.ui_settings.paneLeftWidth = this.preMinimizeWidth;
        }

        try {
            this.config = await apiClient.updateConfig(updateData);
        } catch (error) {
            console.error('Failed to save minimize state:', error);
        }
    }

    /**
     * Start resizing
     */
    startResize(e, side) {
        e.preventDefault();
        this.isResizing = true;
        this.startX = e.clientX;

        if (side === 'left') {
            this.targetPane = document.querySelector('.pane-left');
            this.currentResizer = document.getElementById('resizer-left');
            this.side = 'left';
            if (this.targetPane.classList.contains('minimized')) {
                // If minimized, restore first
                this.toggleMinimizeExplorer(false, false);
                this.startWidth = this.preMinimizeWidth;
            } else {
                this.startWidth = this.targetPane.offsetWidth;
            }
        } else if (side === 'right') {
            this.targetPane = document.querySelector('.pane-right');
            this.currentResizer = document.getElementById('resizer-right');
            this.side = 'right';
            this.startWidth = this.targetPane.offsetWidth;
        }

        if (this.currentResizer) {
            this.currentResizer.classList.add('resizing');
        }

        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }

    /**
     * Resize pane
     */
    resize(e) {
        if (!this.isResizing || !this.targetPane) return;

        const deltaX = e.clientX - this.startX;
        let newWidth;

        // For right pane, we need to subtract deltaX (it grows to the left)
        if (this.targetPane.classList.contains('pane-right')) {
            newWidth = this.startWidth - deltaX;
        } else {
            newWidth = this.startWidth + deltaX;
        }

        // Set minimum and maximum widths
        const minWidth = this.side === 'left' ? 50 : 200;
        const maxWidth = 800;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        if (this.side === 'left' && newWidth < 100) {
            // Visual hint for snapping? For now just set width
        }

        this.targetPane.style.width = `${newWidth}px`;
    }

    /**
     * Stop resizing and save width to config
     */
    async stopResize() {
        if (!this.isResizing) return;

        this.isResizing = false;

        if (this.currentResizer) {
            this.currentResizer.classList.remove('resizing');
        }

        // Restore cursor and selection
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        // Save the new width to config
        if (this.targetPane) {
            if (this.side === 'left' && this.targetPane.offsetWidth < 100) {
                await this.toggleMinimizeExplorer(true);
            } else {
                await this.saveWidth();
            }
        }

        this.currentResizer = null;
        this.targetPane = null;
        this.side = null;
    }

    /**
     * Save current pane width to config
     */
    async saveWidth() {
        if (!this.targetPane) return;

        const width = this.targetPane.offsetWidth;

        // Create partial update object
        const updateData = {
            ui_settings: {}
        };

        // Save the appropriate width
        if (this.targetPane.classList.contains('pane-left')) {
            updateData.ui_settings.paneLeftWidth = width;
        } else if (this.targetPane.classList.contains('pane-right')) {
            updateData.ui_settings.paneRightWidth = width;
        }

        // Save to backend
        try {
            // response is the full updated config
            this.config = await apiClient.updateConfig(updateData);
        } catch (error) {
            console.error('Failed to save pane width:', error);
        }
    }
}

// Create singleton instance
export const resizer = new Resizer();

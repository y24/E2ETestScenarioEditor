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
        }

        if (this.config.ui_settings.paneRightWidth && rightPane) {
            rightPane.style.width = `${this.config.ui_settings.paneRightWidth}px`;
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
        } else if (side === 'right') {
            this.targetPane = document.querySelector('.pane-right');
            this.currentResizer = document.getElementById('resizer-right');
        }

        if (this.targetPane) {
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
        const minWidth = 200;
        const maxWidth = 800;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

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
            await this.saveWidth();
        }

        this.currentResizer = null;
        this.targetPane = null;
    }

    /**
     * Save current pane width to config
     */
    async saveWidth() {
        if (!this.targetPane || !this.config) return;

        const width = this.targetPane.offsetWidth;

        // Initialize ui_settings if it doesn't exist
        if (!this.config.ui_settings) {
            this.config.ui_settings = {};
        }

        // Save the appropriate width
        if (this.targetPane.classList.contains('pane-left')) {
            this.config.ui_settings.paneLeftWidth = width;
        } else if (this.targetPane.classList.contains('pane-right')) {
            this.config.ui_settings.paneRightWidth = width;
        }

        // Save to backend
        try {
            await apiClient.updateConfig(this.config);
        } catch (error) {
            console.error('Failed to save pane width:', error);
        }
    }
}

// Create singleton instance
export const resizer = new Resizer();

const API_BASE = '/api';

export const API = {
    async getConfig() {
        const res = await fetch(`${API_BASE}/config`);
        return res.json();
    },

    async saveConfig(config) {
        const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        return res.json();
    },

    async pickDirectory() {
        const res = await fetch(`${API_BASE}/utils/pick-directory`);
        if (!res.ok) throw new Error('Failed to open directory picker');
        return res.json();
    },

    async openPath(path) {
        const res = await fetch(`${API_BASE}/utils/open-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to open path');
        }
        return res.json();
    },

    async getPageObjects() {
        const res = await fetch(`${API_BASE}/page-objects`);
        if (!res.ok) throw new Error('Failed to fetch page objects');
        return res.json();
    },

    async scanPageObject(targetName) {
        const params = new URLSearchParams({ target: targetName });
        const res = await fetch(`${API_BASE}/page-objects/scan?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to scan page object');
        return res.json();
    },

    async listFiles() {
        const res = await fetch(`${API_BASE}/files`);
        return res.json();
    },

    async loadScenario(path) {
        const params = new URLSearchParams({ path });
        const res = await fetch(`${API_BASE}/scenarios/load?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load scenario');
        return res.json();
    },

    async checkFileStatus(path) {
        const params = new URLSearchParams({ path });
        const res = await fetch(`${API_BASE}/scenarios/status?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to check file status');
        return res.json();
    },

    async saveScenario(path, data, lastModified = null, force = false) {
        const res = await fetch(`${API_BASE}/scenarios/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, data, last_modified: lastModified, force })
        });
        if (!res.ok) {
            if (res.status === 409) {
                const error = new Error('Conflict');
                error.status = 409;
                throw error;
            }
            throw new Error('Failed to save scenario');
        }
        return res.json();
    },

    async renameScenario(oldPath, newName) {
        const res = await fetch(`${API_BASE}/scenarios/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath, newName })
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Failed to rename scenario');
        }
        return res.json();
    },

    async deleteScenario(path) {
        const params = new URLSearchParams({ path });
        const res = await fetch(`${API_BASE}/scenarios/delete?${params.toString()}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Failed to delete scenario');
        }
        return res.json();
    },

    // Templates
    async getTemplates() {
        const res = await fetch(`${API_BASE}/templates`);
        if (!res.ok) throw new Error('Failed to fetch templates');
        return res.json();
    },

    async createTemplate(name, steps) {
        const res = await fetch(`${API_BASE}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, steps })
        });
        if (!res.ok) throw new Error('Failed to create template');
        return res.json();
    },

    async deleteTemplate(templateId) {
        const res = await fetch(`${API_BASE}/templates/${templateId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete template');
        return res.json();
    },

    async toggleTemplateFavorite(templateId) {
        const res = await fetch(`${API_BASE}/templates/${templateId}/favorite`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to toggle favorite');
        return res.json();
    },

    async updateTemplate(templateId, name, steps) {
        const res = await fetch(`${API_BASE}/templates/${templateId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, steps })
        });
        if (!res.ok) throw new Error('Failed to update template');
        return res.json();
    },

    async validateFramework() {
        const res = await fetch(`${API_BASE}/debug-sessions/framework/validate`);
        if (!res.ok) throw new Error('Failed to validate framework');
        return res.json();
    },

    async createDebugSession(payload) {
        const res = await fetch(`${API_BASE}/debug-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to create debug session');
        }
        return res.json();
    },

    async getActiveDebugSession() {
        const res = await fetch(`${API_BASE}/debug-sessions/active`);
        if (!res.ok) throw new Error('Failed to fetch active debug session');
        return res.json();
    },

    async getDebugSession(sessionId) {
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}`);
        if (!res.ok) throw new Error('Failed to fetch debug session status');
        return res.json();
    },

    async getDebugSessionLogs(sessionId, offset = 0) {
        const params = new URLSearchParams({ offset: String(offset) });
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}/logs?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch debug logs');
        return res.json();
    },

    async runDebugSession(sessionId, payload) {
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to run debug session');
        }
        return res.json();
    },

    async cancelDebugSession(sessionId) {
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}/cancel`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to cancel debug session');
        return res.json();
    },

    async closeDebugSession(sessionId, payload = {}) {
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to close debug session');
        }
        return res.json();
    },

    async forceKillDebugSession(sessionId) {
        const res = await fetch(`${API_BASE}/debug-sessions/${sessionId}/force-kill`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to force kill debug session');
        return res.json();
    }
};

// Export as apiClient for compatibility
export const apiClient = {
    getConfig: API.getConfig,
    updateConfig: API.saveConfig
};


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

    async saveScenario(path, data) {
        const res = await fetch(`${API_BASE}/scenarios/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, data })
        });
        if (!res.ok) throw new Error('Failed to save scenario');
        return res.json();
    }
};

// Export as apiClient for compatibility
export const apiClient = {
    getConfig: API.getConfig,
    updateConfig: API.saveConfig
};


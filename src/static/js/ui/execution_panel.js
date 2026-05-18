export class ExecutionPanel {
    constructor() {
        this.panel = document.getElementById('execution-panel');
        this.statusEl = document.getElementById('execution-status');
        this.targetEl = document.getElementById('execution-target');
        this.logEl = document.getElementById('execution-log');
        this.reportLink = document.getElementById('execution-report-link');
        this.toggleBtn = document.getElementById('btn-toggle-execution-panel');
        this.header = this.panel?.querySelector('.execution-panel-header');

        if (this.header) {
            this.header.onclick = () => this.toggle();
        }
    }

    toggle(forceOpen = null) {
        if (!this.panel) return;
        const open = forceOpen === null ? this.panel.classList.contains('collapsed') : forceOpen;
        this.panel.classList.toggle('collapsed', !open);
        const icon = this.toggleBtn?.querySelector('ion-icon');
        if (icon) icon.name = open ? 'chevron-down-outline' : 'chevron-up-outline';
    }

    renderState(state) {
        if (!state) return;
        this.toggle(true);
        this.statusEl.textContent = state.status;
        this.statusEl.className = `execution-status ${state.status}`;
        const current = state.current_index === null || state.current_index === undefined
            ? ''
            : ` ${state.current_section || 'steps'}[${state.current_index}]`;
        const resources = state.resources
            ? ` app:${state.resources.app_active ? 'on' : 'off'} browser:${state.resources.browser_active ? 'on' : 'off'}`
            : '';
        this.targetEl.textContent = `${state.session_id || 'debug'}: ${state.scenario_id || state.scenario_path || ''}${current}${resources}`;

        const reportDir = state.report_dir;
        if (reportDir) {
            this.reportLink.href = `file:///${reportDir.replace(/\\/g, '/')}`;
            this.reportLink.textContent = 'Artifacts';
            this.reportLink.classList.remove('hidden');
        } else {
            this.reportLink.classList.add('hidden');
        }
    }

    renderLogs(lines) {
        this.logEl.textContent = (lines || [])
            .map(line => line.formatted || `[${line.stream || line.level || 'log'}] ${line.text || line.message || ''}`)
            .join('\n');
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }
}

export class ExecutionPanel {
    constructor() {
        this.panel = document.getElementById('execution-panel');
        this.statusEl = document.getElementById('execution-status');
        this.targetEl = document.getElementById('execution-target');
        this.logEl = document.getElementById('execution-log');
        this.reportLink = document.getElementById('execution-report-link');
        this.toggleBtn = document.getElementById('btn-toggle-execution-panel');

        if (this.toggleBtn) {
            this.toggleBtn.onclick = () => this.toggle();
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
        const range = state.step_start === null || state.step_start === undefined
            ? ''
            : ` steps ${state.step_start}-${state.step_end}`;
        this.targetEl.textContent = `${state.mode}: ${state.scenario_id || state.scenario_path}${range}`;

        const report = state.artifacts?.report;
        if (report) {
            this.reportLink.href = `file:///${report.replace(/\\/g, '/')}`;
            this.reportLink.classList.remove('hidden');
        } else {
            this.reportLink.classList.add('hidden');
        }
    }

    renderLogs(lines) {
        this.logEl.textContent = (lines || [])
            .map(line => `[${line.stream}] ${line.text}`)
            .join('\n');
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }
}

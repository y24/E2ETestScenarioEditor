export function showToast(message, typeOrDuration = 'info', duration = 3000) {
    let type = 'info';
    if (typeof typeOrDuration === 'number') {
        duration = typeOrDuration;
    } else if (typeof typeOrDuration === 'string') {
        type = typeOrDuration;
    }

    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }

    // Reset classes
    toast.className = 'toast-notification';
    if (type) {
        toast.classList.add(type);
    }

    toast.textContent = message;

    // Force reflow to restart transition if needed (though visibility handles it mostly)
    void toast.offsetWidth;

    toast.classList.add('show');

    // Clear previous timeout if exists
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }

    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

(function () {
    const storageKey = 'bankees-theme';

    function applyTheme(isDark) {
        document.documentElement.classList.toggle('dark-mode', isDark);
        if (document.body) document.body.classList.toggle('dark-mode', isDark);
        localStorage.setItem(storageKey, isDark ? 'dark' : 'light');
        const toggle = document.querySelector('[data-theme-toggle]');
        if (toggle) toggle.checked = isDark;
    }

    applyTheme(localStorage.getItem(storageKey) === 'dark');
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.querySelector('[data-theme-toggle]');
        if (toggle) toggle.addEventListener('change', () => applyTheme(toggle.checked));
        applyTheme(localStorage.getItem(storageKey) === 'dark');
    });

    const protectedPages = new Set([
        'account.html', 'accounts.html', 'analytics.html', 'cards.html', 'change-password.html',
        'dashboard.html', 'linked-accounts.html', 'notifications.html', 'profile.html',
        'settings.html', 'transaction.html', 'transfer.html'
    ]);
    if (protectedPages.has(window.location.pathname.split('/').pop())) {
        const sessionMonitor = document.createElement('script');
        sessionMonitor.src = '/session-timeout.js';
        document.body.appendChild(sessionMonitor);
    }
})();

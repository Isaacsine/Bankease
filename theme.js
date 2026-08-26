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
})();

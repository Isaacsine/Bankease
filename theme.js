(function () {
    const storageKey = 'bankees-theme';
    const darkMode = localStorage.getItem(storageKey) === 'dark';

    function applyTheme(isDark) {
        document.documentElement.classList.toggle('dark-mode', isDark);
        document.body.classList.toggle('dark-mode', isDark);
        localStorage.setItem(storageKey, isDark ? 'dark' : 'light');
        const toggle = document.querySelector('[data-theme-toggle]');
        if (toggle) toggle.checked = isDark;
    }

    applyTheme(darkMode);
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.querySelector('[data-theme-toggle]');
        if (toggle) toggle.addEventListener('change', () => applyTheme(toggle.checked));
        applyTheme(darkMode);
    });
})();

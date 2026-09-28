(function () {
    const activityKey = 'bankease.lastActivityAt';
    const timeoutKey = 'bankease.idleTimeoutMinutes';
    const timeoutControl = document.querySelector('[data-session-timeout]');
    const supportedTimeouts = [1, 5, 15, 30];
    let timeoutMinutes = Number(localStorage.getItem(timeoutKey)) || 5;
    let lastActivityAt = Number(localStorage.getItem(activityKey)) || Date.now();
    let lastHeartbeatAt = 0;
    let redirecting = false;

    function redirectToLogin() {
        if (redirecting) return;
        redirecting = true;
        localStorage.removeItem(activityKey);
        window.location.href = window.location.pathname.startsWith('/admin/') ? '../login.html' : 'login.html';
    }

    async function sendHeartbeat() {
        lastHeartbeatAt = Date.now();
        try {
            const response = await fetch('/api/session/heartbeat', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-Session-Activity': 'true' },
                keepalive: true
            });
            if (response.status === 401) redirectToLogin();
        } catch (error) {
            // The next authenticated request will enforce the server-side timeout.
        }
    }

    function recordActivity() {
        lastActivityAt = Date.now();
        localStorage.setItem(activityKey, String(lastActivityAt));
        if (lastActivityAt - lastHeartbeatAt >= 15000) sendHeartbeat();
    }

    async function loadTimeout() {
        try {
            const response = await fetch('/api/session/settings', { credentials: 'same-origin' });
            if (response.status === 401) return redirectToLogin();
            if (!response.ok) return;
            const settings = await response.json();
            if (!supportedTimeouts.includes(settings.idleTimeoutMinutes)) return;
            timeoutMinutes = settings.idleTimeoutMinutes;
            localStorage.setItem(timeoutKey, String(timeoutMinutes));
            if (timeoutControl) timeoutControl.value = String(timeoutMinutes);
        } catch (error) {
            // Keep the default timeout; protected API requests still validate the session.
        }
    }

    if (timeoutControl) {
        timeoutControl.addEventListener('change', async () => {
            const selectedTimeout = Number(timeoutControl.value);
            if (!supportedTimeouts.includes(selectedTimeout)) return;
            const response = await fetch('/api/session/settings', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idleTimeoutMinutes: selectedTimeout })
            });
            if (response.status === 401) return redirectToLogin();
            if (!response.ok) {
                timeoutControl.value = String(timeoutMinutes);
                return window.alert('Unable to update the automatic logout time.');
            }
            timeoutMinutes = selectedTimeout;
            localStorage.setItem(timeoutKey, String(timeoutMinutes));
            recordActivity();
        });
    }

    ['click', 'keydown', 'pointerdown', 'touchstart', 'wheel'].forEach((eventName) => {
        document.addEventListener(eventName, recordActivity, { passive: true });
    });

    window.addEventListener('storage', (event) => {
        if (event.key === activityKey && Number(event.newValue) > lastActivityAt) {
            lastActivityAt = Number(event.newValue);
        }
        if (event.key === timeoutKey && supportedTimeouts.includes(Number(event.newValue))) {
            timeoutMinutes = Number(event.newValue);
            if (timeoutControl) timeoutControl.value = String(timeoutMinutes);
        }
    });

    window.setInterval(() => {
        lastActivityAt = Math.max(lastActivityAt, Number(localStorage.getItem(activityKey)) || 0);
        if (Date.now() - lastActivityAt >= timeoutMinutes * 60 * 1000) {
            fetch('/api/logout', { method: 'POST', credentials: 'same-origin', keepalive: true }).finally(redirectToLogin);
            return;
        }
        if (Date.now() - lastActivityAt < 15000 && Date.now() - lastHeartbeatAt >= 15000) {
            sendHeartbeat();
        }
    }, 1000);

    loadTimeout();
})();
async function submitAuthForm(form, endpoint, redirectTo) {
    const submitButton = form.querySelector('button[type="submit"]');
    const message = form.querySelector('.form-message');
    const formData = Object.fromEntries(new FormData(form));

    submitButton.disabled = true;
    message.textContent = 'Please wait...';
    message.className = 'form-message';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(formData)
        });
        const contentType = response.headers.get('content-type') || '';
        const result = contentType.includes('application/json')
            ? await response.json()
            : { error: response.ok
                ? 'The server returned an unexpected response.'
                : `${endpoint.includes('register') ? 'Registration' : 'Login'} is unavailable. Check the Render service logs and environment settings.` };

        if (!response.ok) {
            throw new Error(result.error || 'Authentication failed.');
        }

        if (result.resetUrl) {
            message.textContent = `Use this reset link: ${result.resetUrl}`;
            message.className = 'form-message success';
            submitButton.disabled = false;
            return;
        }
        if (result.message && !redirectTo) {
            message.textContent = result.message;
            message.className = 'form-message success';
            submitButton.disabled = false;
            return;
        }
        if (redirectTo) window.location.href = redirectTo;
    } catch (error) {
        message.textContent = error.message;
        message.className = 'form-message error';
        submitButton.disabled = false;
    }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitAuthForm(loginForm, '/api/login', 'dashboard.html');
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitAuthForm(registerForm, '/api/register', 'dashboard.html');
    });
}

const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitAuthForm(forgotPasswordForm, '/api/forgot-password', null);
    });
}

const changePasswordForm = document.getElementById('changePasswordForm');
if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitAuthForm(changePasswordForm, '/api/change-password', 'settings.html');
    });
}

const resetPasswordForm = document.getElementById('resetPasswordForm');
if (resetPasswordForm) {
    const resetToken = new URLSearchParams(window.location.search).get('token');
    resetPasswordForm.elements.token.value = resetToken || '';
    resetPasswordForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitAuthForm(resetPasswordForm, '/api/reset-password', 'login.html');
    });
}
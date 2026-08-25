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
                : `${endpoint.includes('register') ? 'Registration' : 'Login'} is unavailable. Open this page through http://localhost:3000, not Live Server or a file path.` };

        if (!response.ok) {
            throw new Error(result.error || 'Authentication failed.');
        }

        window.location.href = redirectTo;
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
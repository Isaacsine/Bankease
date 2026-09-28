(function () {
    const passkeyToggle = document.querySelector('[data-passkey-toggle]');
    const passkeyLogin = document.querySelector('[data-passkey-login]');
    const passkeyStatus = document.querySelector('[data-passkey-status]');
    const passkeyBadge = document.querySelector('[data-passkey-badge]');
    const loginMessage = document.querySelector('#loginForm .form-message');
    const supported = Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);

    function encodeBuffer(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function decodeBuffer(value) {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    }

    function creationOptions(options) {
        return {
            ...options,
            challenge: decodeBuffer(options.challenge),
            user: { ...options.user, id: decodeBuffer(options.user.id) },
            excludeCredentials: (options.excludeCredentials || []).map(credential => ({ ...credential, id: decodeBuffer(credential.id) }))
        };
    }

    function requestOptions(options) {
        return {
            ...options,
            challenge: decodeBuffer(options.challenge),
            allowCredentials: (options.allowCredentials || []).map(credential => ({ ...credential, id: decodeBuffer(credential.id) }))
        };
    }

    function credentialJSON(credential) {
        const response = credential.response;
        const serializedResponse = {
            clientDataJSON: encodeBuffer(response.clientDataJSON)
        };
        if ('attestationObject' in response) {
            serializedResponse.attestationObject = encodeBuffer(response.attestationObject);
            serializedResponse.transports = response.getTransports?.() || [];
        } else {
            serializedResponse.authenticatorData = encodeBuffer(response.authenticatorData);
            serializedResponse.signature = encodeBuffer(response.signature);
            if (response.userHandle) serializedResponse.userHandle = encodeBuffer(response.userHandle);
        }
        return {
            id: credential.id,
            rawId: encodeBuffer(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment,
            clientExtensionResults: credential.getClientExtensionResults(),
            response: serializedResponse
        };
    }

    async function send(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
        if (!response.ok) {
            const error = new Error(result.error || 'Passkey request failed.');
            error.status = response.status;
            throw error;
        }
        return result;
    }

    function showLoginMessage(message, isError = true) {
        if (!loginMessage) return;
        loginMessage.textContent = message;
        loginMessage.className = `form-message${isError ? ' error' : ' success'}`;
    }

    function setPasskeyStatus(enabled, description) {
        if (passkeyToggle) passkeyToggle.checked = enabled;
        if (passkeyStatus) passkeyStatus.textContent = description || (enabled ? 'Biometric sign-in is enabled on this account.' : 'No passkey is registered for this account.');
        if (passkeyBadge) {
            passkeyBadge.textContent = enabled ? 'Enabled' : 'Not set';
            passkeyBadge.style.background = enabled ? '#27ae60' : '#7b7b8d';
        }
    }

    async function registerPasskey(password) {
        const ceremony = await send('/api/passkeys/registration/options', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        const credential = await navigator.credentials.create({ publicKey: creationOptions(ceremony.options) });
        if (!credential) throw new Error('The device did not create a passkey.');
        await send('/api/passkeys/registration/verify', {
            method: 'POST',
            body: JSON.stringify({ ceremonyId: ceremony.ceremonyId, credential: credentialJSON(credential) })
        });
    }

    async function authenticateWithPasskey(loginMode) {
        const ceremony = await send('/api/passkeys/authentication/options', {
            method: 'POST',
            body: JSON.stringify({ loginMode })
        });
        const credential = await navigator.credentials.get({ publicKey: requestOptions(ceremony.options) });
        if (!credential) throw new Error('No passkey was selected.');
        const result = await send('/api/passkeys/authentication/verify', {
            method: 'POST',
            body: JSON.stringify({ ceremonyId: ceremony.ceremonyId, loginMode, credential: credentialJSON(credential) })
        });
        localStorage.removeItem('bankease.lastActivityAt');
        localStorage.removeItem('bankease.idleTimeoutMinutes');
        window.location.href = result.user?.role === 'admin' ? 'admin/' : 'dashboard.html';
    }

    if (passkeyToggle) {
        if (!supported) {
            passkeyToggle.disabled = true;
            setPasskeyStatus(false, 'Biometric sign-in needs a supported browser on HTTPS or localhost.');
        } else {
            send('/api/passkeys/status').then(result => setPasskeyStatus(result.enabled)).catch(() => {
                setPasskeyStatus(false, 'Unable to load passkey status.');
            });
            passkeyToggle.addEventListener('change', async () => {
                const shouldEnable = passkeyToggle.checked;
                passkeyToggle.disabled = true;
                try {
                    const password = window.prompt(`Enter your current password to ${shouldEnable ? 'enable' : 'disable'} biometric sign-in:`);
                    if (password === null || !password) throw new Error('Password confirmation is required.');
                    if (shouldEnable) {
                        await registerPasskey(password);
                    } else {
                        await send('/api/passkeys', { method: 'DELETE', body: JSON.stringify({ password }) });
                    }
                    setPasskeyStatus(shouldEnable);
                } catch (error) {
                    setPasskeyStatus(!shouldEnable, error.message);
                    window.alert(error.message);
                } finally {
                    passkeyToggle.disabled = false;
                }
            });
        }
    }

    if (passkeyLogin) {
        if (!supported) {
            passkeyLogin.disabled = true;
            passkeyLogin.title = 'Biometric sign-in requires HTTPS and a supported browser.';
        }
        passkeyLogin.addEventListener('click', async () => {
            if (!supported) return;
            passkeyLogin.disabled = true;
            showLoginMessage('Waiting for your device...', false);
            try {
                const loginMode = document.querySelector('#loginForm [name="loginMode"]')?.value || 'user';
                await authenticateWithPasskey(loginMode);
            } catch (error) {
                showLoginMessage(error.name === 'NotAllowedError' ? 'Passkey sign-in was cancelled or timed out.' : error.message);
            } finally {
                passkeyLogin.disabled = false;
            }
        });
    }
})();

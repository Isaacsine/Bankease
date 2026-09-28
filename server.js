require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} = require('@simplewebauthn/server');
const supabase = require('./supabase-client');

const app = express();
const port = process.env.PORT || 3000;
const idleTimeoutOptions = [1, 5, 15, 30];
const defaultIdleTimeoutMinutes = 5;
const serverInstanceId = crypto.randomUUID();
const pendingWebAuthnCeremonies = new Map();
const webAuthnChallengeLifetimeMs = 5 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : 'change-this-local-session-secret');
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use((request, response, next) => {
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
});
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieSession({
    name: 'bankees.sid',
    keys: [sessionSecret || 'invalid-production-session-secret'],
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
}));

if (!sessionSecret) {
    throw new Error('Configure SESSION_SECRET in the Render environment variables.');
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again shortly.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' }
});

function sameOrigin(request) {
    const origin = request.get('origin');
    if (origin) return origin === `${request.protocol}://${request.get('host')}`;
    const referer = request.get('referer');
    if (referer) {
        try { return new URL(referer).origin === `${request.protocol}://${request.get('host')}`; } catch { return false; }
    }
    return true;
}

app.use('/api', apiLimiter);
app.use(['/api/login', '/api/register', '/api/forgot-password', '/api/reset-password', '/api/passkeys/authentication/options', '/api/passkeys/authentication/verify'], authLimiter);
app.use('/api', (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || sameOrigin(request)) return next();
    return response.status(403).json({ error: 'Cross-site request blocked.' });
});
app.use('/api', async (request, response, next) => {
    try {
        if (!request.session?.userId || !request.session?.sessionId) return next();
        const { data: session, error } = await supabase.from('user_sessions').select('id,last_seen_at').eq('id', request.session.sessionId).eq('user_id', request.session.userId).eq('is_active', true).maybeSingle();
        if (error) throw error;
        const idleTimeoutMinutes = idleTimeoutOptions.includes(request.session.idleTimeoutMinutes)
            ? request.session.idleTimeoutMinutes
            : defaultIdleTimeoutMinutes;
        const lastSeenAt = session ? new Date(session.last_seen_at).getTime() : 0;
        const isExpired = !session
            || request.session.serverInstanceId !== serverInstanceId
            || !Number.isFinite(lastSeenAt)
            || Date.now() - lastSeenAt >= idleTimeoutMinutes * 60 * 1000;
        if (isExpired) {
            if (session) {
                const { error: expireError } = await supabase.from('user_sessions').update({ is_active: false }).eq('id', session.id);
                if (expireError) throw expireError;
            }
            request.session = null;
            return next();
        }
        if (request.get('x-session-activity') === 'true') {
            const { error: updateError } = await supabase.from('user_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id);
            if (updateError) throw updateError;
        }
        return next();
    } catch (error) { return next(error); }
});

function publicUser(user) {
    return { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone, role: user.role, status: user.status, defaultBankId: user.default_bank_id || null, createdAt: user.created_at };
}

async function findUserByEmail(email) {
    if (typeof email !== 'string') return null;
    const { data, error } = await supabase.from('users').select('*').ilike('email', email.trim()).maybeSingle();
    if (error) throw error;
    return data;
}

function requireUser(request, response) {
    if (!request.session?.userId) {
        response.status(401).json({ error: 'Not logged in.' });
        return false;
    }
    return true;
}

function passwordResetTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function webAuthnConfig(request) {
    const rpID = process.env.WEBAUTHN_RP_ID || request.hostname;
    const expectedOrigin = process.env.WEBAUTHN_ORIGIN || `${request.protocol}://${request.get('host')}`;
    return { rpID, expectedOrigin };
}

function saveWebAuthnCeremony(options, details = {}) {
    const now = Date.now();
    for (const [id, ceremony] of pendingWebAuthnCeremonies) {
        if (ceremony.expiresAt <= now) pendingWebAuthnCeremonies.delete(id);
    }
    if (pendingWebAuthnCeremonies.size >= 5000) {
        const oldestId = pendingWebAuthnCeremonies.keys().next().value;
        if (oldestId) pendingWebAuthnCeremonies.delete(oldestId);
    }
    const ceremonyId = crypto.randomUUID();
    pendingWebAuthnCeremonies.set(ceremonyId, {
        challenge: options.challenge,
        expiresAt: now + webAuthnChallengeLifetimeMs,
        ...details
    });
    return ceremonyId;
}

function takeWebAuthnCeremony(ceremonyId, type) {
    if (typeof ceremonyId !== 'string') return null;
    const ceremony = pendingWebAuthnCeremonies.get(ceremonyId);
    pendingWebAuthnCeremonies.delete(ceremonyId);
    if (!ceremony || ceremony.type !== type || ceremony.expiresAt <= Date.now()) return null;
    return ceremony;
}

function credentialTransports(credential) {
    const transports = credential?.response?.transports;
    return Array.isArray(transports) ? transports.filter(value => typeof value === 'string') : [];
}

async function establishLoginSession(request, user) {
    request.session = { userId: user.id };
    const loggedInAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('users').update({ last_login_at: loggedInAt }).eq('id', user.id);
    if (updateError) throw updateError;
    await createUserSession(request, user.id);
}

function passwordIsValid(password) {
    return typeof password === 'string' && password.length >= 8;
}

async function recordAudit(actorUserId, action, targetUserId, metadata = {}) {
    const { error } = await supabase.from('audit_logs').insert({ actor_user_id: actorUserId, action, target_user_id: targetUserId || null, metadata });
    if (error) console.error('Could not record audit event:', error.message);
}

async function createUserSession(request, userId) {
    const { data: session, error } = await supabase.from('user_sessions').insert({
        user_id: userId,
        ip_address: request.ip,
        user_agent: request.get('user-agent') || null
    }).select('id').single();
    if (error) throw error;
    request.session.sessionId = session.id;
    request.session.serverInstanceId = serverInstanceId;
    request.session.idleTimeoutMinutes = defaultIdleTimeoutMinutes;
    await recordAudit(userId, 'session_started', null, { sessionId: session.id });
}

async function requireAdmin(request, response) {
    if (!requireUser(request, response)) return null;
    const { data: user, error } = await supabase.from('users').select('id,role,status').eq('id', request.session.userId).maybeSingle();
    if (error) throw error;
    if (!user || user.status !== 'active') {
        request.session = null;
        response.status(401).json({ error: 'Your account is inactive.' });
        return null;
    }
    if (user.role !== 'admin') {
        response.status(403).json({ error: 'Administrator access is required.' });
        return null;
    }
    return user;
}

app.get('/api/health', async (request, response, next) => {
    try {
        const { error } = await supabase.from('users').select('id').limit(1);
        if (error) throw error;
        return response.json({ status: 'ok', service: 'bankees-api', database: 'supabase' });
    } catch (error) { return next(error); }
});

app.post('/api/register', async (request, response, next) => {
    try {
        const { fullName, email, phone, password, confirmPassword } = request.body || {};
        if ([fullName, email, phone, password, confirmPassword].some(value => typeof value !== 'string' || !value.trim())) return response.status(400).json({ error: 'Please complete every field.' });
        if (password !== confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' });
        if (password.length < 8) return response.status(422).json({ error: 'Password must be at least 8 characters.' });
        if (await findUserByEmail(email)) return response.status(409).json({ error: 'An account with that email already exists.' });
        const passwordHash = await bcrypt.hash(password, 12);
        const { data: user, error } = await supabase.from('users').insert({ full_name: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password_hash: passwordHash }).select().single();
        if (error) throw error;
        request.session.userId = user.id;
        await createUserSession(request, user.id);
        return response.status(201).json({ user: publicUser(user) });
    } catch (error) { return next(error); }
});

app.post('/api/login', async (request, response, next) => {
    try {
        const { email, password, loginMode = 'user' } = request.body || {};
        if (!['user', 'admin'].includes(loginMode)) return response.status(400).json({ error: 'Login type is invalid.' });
        const user = await findUserByEmail(email);
        if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error: 'Email or password is incorrect.' });
        if (user.status === 'suspended') return response.status(403).json({ error: 'This account is suspended.' });
        if (loginMode === 'admin' && user.role !== 'admin') return response.status(403).json({ error: 'This account does not have administrator access.' });
        if (loginMode === 'user' && user.role === 'admin') return response.status(403).json({ error: 'Choose Admin login for this account.' });
        await establishLoginSession(request, user);
        return response.json({ user: publicUser(user) });
    } catch (error) { return next(error); }
});

app.get('/api/passkeys/status', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { count, error } = await supabase.from('passkeys').select('id', { count: 'exact', head: true }).eq('user_id', request.session.userId);
        if (error) throw error;
        return response.json({ enabled: (count || 0) > 0 });
    } catch (error) { return next(error); }
});

app.post('/api/passkeys/registration/options', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { password } = request.body || {};
        const { data: user, error: userError } = await supabase.from('users').select('id,full_name,email,password_hash').eq('id', request.session.userId).maybeSingle();
        if (userError) throw userError;
        if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
            return response.status(401).json({ error: 'Enter your current password to enable biometric sign-in.' });
        }
        const { data: existingCredentials, error: credentialError } = await supabase.from('passkeys').select('credential_id,transports').eq('user_id', user.id);
        if (credentialError) throw credentialError;
        const { rpID } = webAuthnConfig(request);
        const options = await generateRegistrationOptions({
            rpName: 'Bankease',
            rpID,
            userID: Buffer.from(user.id),
            userName: user.email,
            userDisplayName: user.full_name,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                residentKey: 'required',
                userVerification: 'required'
            },
            excludeCredentials: (existingCredentials || []).map(credential => ({ id: credential.credential_id, transports: credential.transports || [] }))
        });
        const ceremonyId = saveWebAuthnCeremony(options, { type: 'registration', userId: user.id, sessionId: request.session.sessionId });
        return response.json({ options, ceremonyId });
    } catch (error) { return next(error); }
});

app.post('/api/passkeys/registration/verify', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const ceremony = takeWebAuthnCeremony(request.body?.ceremonyId, 'registration');
        if (!ceremony || ceremony.userId !== request.session.userId || ceremony.sessionId !== request.session.sessionId) {
            return response.status(400).json({ error: 'Passkey setup expired. Please try again.' });
        }
        const { expectedOrigin, rpID } = webAuthnConfig(request);
        const verification = await verifyRegistrationResponse({
            response: request.body?.credential,
            expectedChallenge: ceremony.challenge,
            expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: true
        });
        if (!verification.verified || !verification.registrationInfo) {
            return response.status(400).json({ error: 'The device could not verify this passkey.' });
        }
        const { credential } = verification.registrationInfo;
        const { error } = await supabase.from('passkeys').insert({
            user_id: request.session.userId,
            credential_id: credential.id,
            public_key: Buffer.from(credential.publicKey).toString('base64url'),
            counter: credential.counter,
            transports: credentialTransports(request.body?.credential),
            device_type: verification.registrationInfo.credentialDeviceType,
            backed_up: verification.registrationInfo.credentialBackedUp
        });
        if (error) throw error;
        return response.json({ enabled: true });
    } catch (error) { return next(error); }
});

app.delete('/api/passkeys', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { password } = request.body || {};
        const { data: user, error: userError } = await supabase.from('users').select('password_hash').eq('id', request.session.userId).maybeSingle();
        if (userError) throw userError;
        if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
            return response.status(401).json({ error: 'Enter your current password to disable biometric sign-in.' });
        }
        const { error } = await supabase.from('passkeys').delete().eq('user_id', request.session.userId);
        if (error) throw error;
        return response.json({ enabled: false });
    } catch (error) { return next(error); }
});

app.post('/api/passkeys/authentication/options', async (request, response, next) => {
    try {
        const { rpID } = webAuthnConfig(request);
        const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
        const ceremonyId = saveWebAuthnCeremony(options, { type: 'authentication', loginMode: request.body?.loginMode || 'user' });
        return response.json({ options, ceremonyId });
    } catch (error) { return next(error); }
});

app.post('/api/passkeys/authentication/verify', async (request, response, next) => {
    try {
        const ceremony = takeWebAuthnCeremony(request.body?.ceremonyId, 'authentication');
        const loginMode = request.body?.loginMode || 'user';
        if (!ceremony || !['user', 'admin'].includes(loginMode) || ceremony.loginMode !== loginMode) {
            return response.status(400).json({ error: 'Passkey sign-in expired. Please try again.' });
        }
        const credentialId = request.body?.credential?.id;
        if (typeof credentialId !== 'string') return response.status(400).json({ error: 'Passkey response is invalid.' });
        const { data: passkey, error: passkeyError } = await supabase.from('passkeys').select('id,user_id,credential_id,public_key,counter,transports').eq('credential_id', credentialId).maybeSingle();
        if (passkeyError) throw passkeyError;
        if (!passkey) return response.status(401).json({ error: 'No matching passkey was found.' });
        const userHandle = request.body?.credential?.response?.userHandle;
        if (userHandle !== Buffer.from(passkey.user_id).toString('base64url')) {
            return response.status(401).json({ error: 'The passkey does not match this account.' });
        }
        const { expectedOrigin, rpID } = webAuthnConfig(request);
        const verification = await verifyAuthenticationResponse({
            response: request.body.credential,
            expectedChallenge: ceremony.challenge,
            expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: {
                id: passkey.credential_id,
                publicKey: Buffer.from(passkey.public_key, 'base64url'),
                counter: Number(passkey.counter),
                transports: passkey.transports || []
            }
        });
        if (!verification.verified) return response.status(401).json({ error: 'Passkey verification failed.' });
        const { data: user, error: userError } = await supabase.from('users').select('*').eq('id', passkey.user_id).maybeSingle();
        if (userError) throw userError;
        if (!user || user.status !== 'active') return response.status(403).json({ error: 'This account is unavailable.' });
        if ((loginMode === 'admin') !== (user.role === 'admin')) return response.status(403).json({ error: 'Choose the correct login type for this account.' });
        const { error: updateError } = await supabase.from('passkeys').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', passkey.id);
        if (updateError) throw updateError;
        await establishLoginSession(request, user);
        return response.json({ user: publicUser(user) });
    } catch (error) { return next(error); }
});

app.post('/api/change-password', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { currentPassword, newPassword, confirmPassword } = request.body || {};
        if (!passwordIsValid(newPassword)) return response.status(422).json({ error: 'New password must be at least 8 characters.' });
        if (newPassword !== confirmPassword) return response.status(400).json({ error: 'New passwords do not match.' });
        const { data: user, error: findError } = await supabase.from('users').select('password_hash').eq('id', request.session.userId).maybeSingle();
        if (findError) throw findError;
        if (!user || typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) return response.status(401).json({ error: 'Current password is incorrect.' });
        const passwordHash = await bcrypt.hash(newPassword, 12);
        const { error } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', request.session.userId);
        if (error) throw error;
        const { error: sessionError } = await supabase.from('user_sessions').update({ is_active: false }).eq('user_id', request.session.userId).neq('id', request.session.sessionId || '00000000-0000-0000-0000-000000000000');
        if (sessionError) throw sessionError;
        return response.json({ message: 'Password updated successfully.' });
    } catch (error) { return next(error); }
});

app.post('/api/forgot-password', async (request, response, next) => {
    try {
        const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
        const genericResponse = { message: 'If an account exists for that email, a reset link has been created.' };
        if (!email) return response.status(400).json({ error: 'Enter your email address.' });
        const user = await findUserByEmail(email);
        if (!user) return response.json(genericResponse);
        const token = crypto.randomBytes(32).toString('hex');
        const { error } = await supabase.from('password_reset_tokens').insert({ user_id: user.id, token_hash: passwordResetTokenHash(token), expires_at: new Date(Date.now() + 1000 * 60 * 30).toISOString() });
        if (error) throw error;
        const baseUrl = process.env.PASSWORD_RESET_BASE_URL || `http://localhost:${port}`;
        const result = { ...genericResponse };
        if (process.env.NODE_ENV !== 'production') result.resetUrl = `${baseUrl}/reset-password.html?token=${token}`;
        return response.json(result);
    } catch (error) { return next(error); }
});

app.post('/api/reset-password', async (request, response, next) => {
    try {
        const { token, newPassword, confirmPassword } = request.body || {};
        if (typeof token !== 'string' || !token) return response.status(400).json({ error: 'This reset link is invalid.' });
        if (!passwordIsValid(newPassword)) return response.status(422).json({ error: 'New password must be at least 8 characters.' });
        if (newPassword !== confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' });
        const { data: resetToken, error: tokenError } = await supabase.from('password_reset_tokens').select('id,user_id,expires_at').eq('token_hash', passwordResetTokenHash(token)).maybeSingle();
        if (tokenError) throw tokenError;
        if (!resetToken || new Date(resetToken.expires_at) <= new Date()) return response.status(400).json({ error: 'This reset link is invalid or has expired.' });
        const passwordHash = await bcrypt.hash(newPassword, 12);
        const { error: updateError } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', resetToken.user_id);
        if (updateError) throw updateError;
        const { error: sessionError } = await supabase.from('user_sessions').update({ is_active: false }).eq('user_id', resetToken.user_id);
        if (sessionError) throw sessionError;
        const { error: deleteError } = await supabase.from('password_reset_tokens').delete().eq('id', resetToken.id);
        if (deleteError) throw deleteError;
        return response.json({ message: 'Password updated successfully.' });
    } catch (error) { return next(error); }
});

app.post('/api/logout', async (request, response, next) => {
    try {
        if (request.session?.sessionId) {
            const { error } = await supabase.from('user_sessions').update({ is_active: false }).eq('id', request.session.sessionId);
            if (error) throw error;
            await recordAudit(request.session.userId, 'session_ended', null, { sessionId: request.session.sessionId });
        }
    } catch (error) { return next(error); }
    request.session = null;
    return response.status(204).end();
});

app.get('/api/session/settings', (request, response) => {
    if (!requireUser(request, response)) return;
    const idleTimeoutMinutes = idleTimeoutOptions.includes(request.session.idleTimeoutMinutes)
        ? request.session.idleTimeoutMinutes
        : defaultIdleTimeoutMinutes;
    return response.json({ idleTimeoutMinutes });
});

app.post('/api/session/settings', (request, response) => {
    if (!requireUser(request, response)) return;
    const { idleTimeoutMinutes } = request.body || {};
    if (!idleTimeoutOptions.includes(idleTimeoutMinutes)) {
        return response.status(400).json({ error: 'Choose a valid automatic logout time.' });
    }
    request.session.idleTimeoutMinutes = idleTimeoutMinutes;
    return response.json({ idleTimeoutMinutes });
});

app.post('/api/session/heartbeat', (request, response) => {
    if (!requireUser(request, response)) return;
    return response.status(204).end();
});

app.get('/api/me', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: user, error } = await supabase.from('users').select('*').eq('id', request.session.userId).maybeSingle();
        if (error) throw error;
        if (!user) return response.status(401).json({ error: 'Session user no longer exists.' });
        return response.json({ user: publicUser(user) });
    } catch (error) { return next(error); }
});

app.get('/api/banks', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const [{ data: banks, error }, { data: user, error: userError }] = await Promise.all([
            supabase.from('banks').select('id,name,custom_name,last_digits,balance,full_name,account_type,is_active,low_balance_threshold').eq('user_id', request.session.userId).order('created_at'),
            supabase.from('users').select('default_bank_id').eq('id', request.session.userId).maybeSingle()
        ]);
        if (error) throw error;
        if (userError) throw userError;
        return response.json({ banks, defaultBankId: user?.default_bank_id || null });
    } catch (error) { return next(error); }
});

app.post('/api/banks', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { name, accountNumber, balance, accountType } = request.body || {};
        const numericBalance = balance === undefined || balance === '' ? 0 : Number(balance);
        if (typeof name !== 'string' || !name.trim() || typeof accountNumber !== 'string' || !/^\d{4}$/.test(accountNumber.replace(/\s/g, ''))) return response.status(400).json({ error: 'Enter a bank and exactly the last 4 digits of the account or card.' });
        if (!Number.isFinite(numericBalance) || numericBalance < 0) return response.status(422).json({ error: 'Balance must be zero or greater.' });
        const bank = { user_id: request.session.userId, name: name.trim(), custom_name: null, last_digits: accountNumber.replace(/\s/g, '').slice(-4), balance: numericBalance, full_name: name.trim(), account_type: accountType || 'savings' };
        const { data, error } = await supabase.from('banks').insert(bank).select('id,name,custom_name,last_digits,balance,full_name,account_type,is_active,low_balance_threshold').single();
        if (error) {
            if (error.code === '23505') return response.status(409).json({ error: 'This bank is already linked.' });
            throw error;
        }
        await recordAudit(request.session.userId, 'bank_linked', null, { bankId: data.id, bankName: data.name });
        return response.status(201).json({ bank: data });
    } catch (error) { return next(error); }
});

app.patch('/api/banks/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { customName, accountNumber, accountType, lowBalanceThreshold } = request.body || {};
        const updates = {};
        if (customName !== undefined) {
            if (typeof customName !== 'string' || customName.trim().length > 60) return response.status(400).json({ error: 'Account name must be 60 characters or fewer.' });
            updates.custom_name = customName.trim() || null;
        }
        if (accountNumber !== undefined) {
            if (typeof accountNumber !== 'string' || !/^\d{4}$/.test(accountNumber.replace(/\s/g, ''))) return response.status(400).json({ error: 'Enter exactly the last 4 digits of the account or card.' });
            updates.last_digits = accountNumber.replace(/\s/g, '');
        }
        if (accountType !== undefined) {
            if (!['cheque', 'savings', 'credit', 'investment'].includes(accountType)) return response.status(400).json({ error: 'Choose a valid account type.' });
            updates.account_type = accountType;
        }
        if (lowBalanceThreshold !== undefined) {
            if (lowBalanceThreshold === null || lowBalanceThreshold === '') updates.low_balance_threshold = null;
            else {
                const threshold = Number(lowBalanceThreshold);
                if (!Number.isFinite(threshold) || threshold < 0 || threshold > 9999999999.99) return response.status(422).json({ error: 'Low-balance alert must be a valid amount of zero or more.' });
                updates.low_balance_threshold = threshold;
            }
        }
        if (!Object.keys(updates).length) return response.status(400).json({ error: 'Choose at least one account detail to update.' });
        const { data: bank, error } = await supabase.from('banks').update(updates).eq('id', request.params.id).eq('user_id', request.session.userId).select('id,name,custom_name,last_digits,balance,full_name,account_type,is_active,low_balance_threshold').maybeSingle();
        if (error) throw error;
        if (!bank) return response.status(404).json({ error: 'Linked account was not found.' });
        await recordAudit(request.session.userId, 'bank_updated', null, { bankId: bank.id, bankName: bank.name, fields: Object.keys(updates) });
        return response.json({ bank });
    } catch (error) { return next(error); }
});

app.patch('/api/banks/:id/status', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { isActive } = request.body || {};
        if (typeof isActive !== 'boolean') return response.status(400).json({ error: 'Choose whether to pause or reactivate this account.' });
        const { data: status, error } = await supabase.rpc('set_bank_active_state', {
            p_user_id: request.session.userId,
            p_bank_id: request.params.id,
            p_is_active: isActive
        });
        if (error) {
            const statusCode = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 409;
            return response.status(statusCode).json({ error: error.message });
        }
        const { data: bank, error: bankError } = await supabase.from('banks').select('id,name,custom_name,last_digits,balance,full_name,account_type,is_active,low_balance_threshold').eq('id', request.params.id).eq('user_id', request.session.userId).single();
        if (bankError) throw bankError;
        return response.json({ bank, status });
    } catch (error) { return next(error); }
});

app.patch('/api/me/default-bank', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const bankId = request.body?.bankId;
        if (bankId !== null && (typeof bankId !== 'string' || !bankId)) return response.status(400).json({ error: 'Choose a valid default account.' });
        const { data: defaultBankId, error } = await supabase.rpc('set_default_bank', { p_user_id: request.session.userId, p_bank_id: bankId });
        if (error) {
            const status = error.code === 'P0002' ? 404 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.json({ defaultBankId });
    } catch (error) { return next(error); }
});

app.delete('/api/banks/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: deletedBank, error } = await supabase.from('banks').delete()
            .eq('id', request.params.id)
            .eq('user_id', request.session.userId)
            .select('id,name')
            .maybeSingle();
        if (error) throw error;
        if (!deletedBank) return response.status(404).json({ error: 'Linked account was not found.' });
        await recordAudit(request.session.userId, 'bank_unlinked', null, { bankId: deletedBank.id, bankName: deletedBank.name });
        return response.status(204).end();
    } catch (error) { return next(error); }
});

app.get('/api/beneficiaries', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: beneficiaries, error } = await supabase.from('beneficiaries').select('id,name,bank_name,account_last_digits,contact,created_at').eq('user_id', request.session.userId).order('name');
        if (error) throw error;
        return response.json({ beneficiaries });
    } catch (error) { return next(error); }
});

app.post('/api/beneficiaries', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { name, bankName, accountLastDigits, contact } = request.body || {};
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) return response.status(400).json({ error: 'Enter a beneficiary name (up to 100 characters).' });
        if (typeof bankName !== 'string' || !bankName.trim() || bankName.trim().length > 80) return response.status(400).json({ error: 'Enter the beneficiary bank name (up to 80 characters).' });
        if (typeof accountLastDigits !== 'string' || !/^\d{4}$/.test(accountLastDigits.trim())) return response.status(400).json({ error: 'Enter only the last 4 digits of the beneficiary account.' });
        if (contact !== undefined && (typeof contact !== 'string' || contact.trim().length > 100)) return response.status(400).json({ error: 'Contact details must be 100 characters or fewer.' });
        const { data: beneficiary, error } = await supabase.from('beneficiaries').insert({
            user_id: request.session.userId,
            name: name.trim(),
            bank_name: bankName.trim(),
            account_last_digits: accountLastDigits.trim(),
            contact: contact?.trim() || null
        }).select('id,name,bank_name,account_last_digits,contact,created_at').single();
        if (error?.code === '23505') return response.status(409).json({ error: 'That beneficiary account is already saved.' });
        if (error) throw error;
        await recordAudit(request.session.userId, 'beneficiary_added', null, { beneficiaryId: beneficiary.id, name: beneficiary.name, bankName: beneficiary.bank_name });
        return response.status(201).json({ beneficiary });
    } catch (error) { return next(error); }
});

app.delete('/api/beneficiaries/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: beneficiary, error } = await supabase.from('beneficiaries').delete().eq('id', request.params.id).eq('user_id', request.session.userId).select('id,name,bank_name').maybeSingle();
        if (error) throw error;
        if (!beneficiary) return response.status(404).json({ error: 'Beneficiary was not found.' });
        await recordAudit(request.session.userId, 'beneficiary_removed', null, { beneficiaryId: beneficiary.id, name: beneficiary.name, bankName: beneficiary.bank_name });
        return response.status(204).end();
    } catch (error) { return next(error); }
});

app.get('/api/savings-goals', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: goals, error } = await supabase.from('savings_goals').select('id,name,target_amount,saved_amount,created_at').eq('user_id', request.session.userId).order('created_at', { ascending: false });
        if (error) throw error;
        return response.json({ goals });
    } catch (error) { return next(error); }
});

app.post('/api/savings-goals', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { name, target } = request.body || {};
        const targetAmount = Number(target);
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return response.status(400).json({ error: 'Enter a goal name (up to 80 characters).' });
        if (!Number.isFinite(targetAmount) || targetAmount <= 0 || targetAmount > 9999999999.99) return response.status(422).json({ error: 'Enter a valid goal target greater than zero.' });
        const roundedTarget = Math.round(targetAmount * 100) / 100;
        if (roundedTarget <= 0) return response.status(422).json({ error: 'Goal target must be at least R0.01.' });
        const { data: goal, error } = await supabase.from('savings_goals').insert({ user_id: request.session.userId, name: name.trim(), target_amount: roundedTarget }).select('id,name,target_amount,saved_amount,created_at').single();
        if (error) throw error;
        await recordAudit(request.session.userId, 'savings_goal_created', null, { goalId: goal.id, goalName: goal.name, targetAmount: goal.target_amount });
        return response.status(201).json({ goal });
    } catch (error) { return next(error); }
});

app.get('/api/savings-goals/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: goal, error } = await supabase.from('savings_goals').select('id,name,target_amount,saved_amount,created_at').eq('id', request.params.id).eq('user_id', request.session.userId).maybeSingle();
        if (error) throw error;
        if (!goal) return response.status(404).json({ error: 'Savings goal was not found.' });
        const { data: contributions, error: contributionError } = await supabase.from('transactions').select('id,from_bank_id,title,amount,memo,status,created_at').eq('user_id', request.session.userId).eq('goal_id', goal.id).order('created_at', { ascending: false });
        if (contributionError) throw contributionError;
        return response.json({ goal, contributions });
    } catch (error) { return next(error); }
});

app.delete('/api/savings-goals/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { error } = await supabase.rpc('delete_empty_savings_goal', { p_user_id: request.session.userId, p_goal_id: request.params.id });
        if (error) {
            const status = error.code === 'P0002' ? 404 : error.code === '55000' ? 409 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.status(204).end();
    } catch (error) { return next(error); }
});

app.post('/api/savings-goals/:id/contributions', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { bankId, amount, note } = request.body || {};
        const value = Number(amount);
        if (!bankId) return response.status(400).json({ error: 'Choose an active source account.' });
        if (!Number.isFinite(value) || value <= 0 || value > 9999999999.99) return response.status(422).json({ error: 'Contribution must be a valid amount greater than zero.' });
        if (Math.round(value * 100) / 100 <= 0) return response.status(422).json({ error: 'Contribution must be at least R0.01.' });
        if (note !== undefined && (typeof note !== 'string' || note.trim().length > 240)) return response.status(400).json({ error: 'Contribution note must be 240 characters or fewer.' });
        const { data: contribution, error } = await supabase.rpc('contribute_to_savings_goal', {
            p_user_id: request.session.userId,
            p_bank_id: bankId,
            p_goal_id: request.params.id,
            p_amount: Math.round(value * 100) / 100,
            p_note: typeof note === 'string' ? note.trim() : null
        });
        if (error) {
            const status = ['22003', '55000'].includes(error.code) ? 409 : error.code === 'P0002' ? 404 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.status(201).json({ contribution });
    } catch (error) { return next(error); }
});

app.post('/api/transfers', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { fromId, toId, amount } = request.body || {};
        const value = Number(amount);
        if (!fromId || !toId) return response.status(404).json({ error: 'Source or destination bank was not found.' });
        if (!Number.isFinite(value) || value <= 0) return response.status(422).json({ error: 'Transfer amount must be greater than zero.' });
        const { data: transfer, error } = await supabase.rpc('transfer_between_banks', { p_user_id: request.session.userId, p_from_bank_id: fromId, p_to_bank_id: toId, p_amount: value });
        if (error) {
            const status = ['22003', '55000'].includes(error.code) ? 409 : error.code === 'P0002' ? 404 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.status(201).json({ transfer });
    } catch (error) { return next(error); }
});

app.post('/api/beneficiary-transfers', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { fromId, beneficiaryId, amount, note } = request.body || {};
        const value = Number(amount);
        if (!fromId || !beneficiaryId) return response.status(400).json({ error: 'Choose a source account and beneficiary.' });
        if (!Number.isFinite(value) || value <= 0) return response.status(422).json({ error: 'Transfer amount must be greater than zero.' });
        if (note !== undefined && (typeof note !== 'string' || note.trim().length > 240)) return response.status(400).json({ error: 'Transfer note must be 240 characters or fewer.' });
        const { data: transfer, error } = await supabase.rpc('transfer_to_beneficiary', {
            p_user_id: request.session.userId,
            p_from_bank_id: fromId,
            p_beneficiary_id: beneficiaryId,
            p_amount: value,
            p_note: typeof note === 'string' ? note.trim() : null
        });
        if (error) {
            const status = ['22003', '55000'].includes(error.code) ? 409 : error.code === 'P0002' ? 404 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.status(201).json({ transfer });
    } catch (error) { return next(error); }
});

app.post('/api/airtime', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { network, phone, bankId, amount } = request.body || {};
        const value = Number(amount);
        if (typeof network !== 'string' || !network.trim() || typeof phone !== 'string' || !phone.trim() || !bankId) return response.status(400).json({ error: 'Enter the network, cellphone number, and bank.' });
        if (!Number.isFinite(value) || value <= 0) return response.status(422).json({ error: 'Airtime amount must be greater than zero.' });
        const { data: purchase, error } = await supabase.rpc('purchase_airtime', { p_user_id: request.session.userId, p_bank_id: bankId, p_network: network.trim(), p_phone: phone.trim(), p_amount: value });
        if (error) {
            const status = ['22003', '55000'].includes(error.code) ? 409 : error.code === 'P0002' ? 404 : 400;
            return response.status(status).json({ error: error.message });
        }
        return response.status(201).json({ purchase });
    } catch (error) { return next(error); }
});

app.get('/api/transactions', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: transactions, error } = await supabase.from('transactions').select('*').eq('user_id', request.session.userId).order('created_at', { ascending: false });
        if (error) throw error;
        return response.json({ transactions });
    } catch (error) { return next(error); }
});

app.get('/api/admin/overview', async (request, response, next) => {
    try {
        if (!await requireAdmin(request, response)) return;
        const [{ count: totalUsers }, { count: activeUsers }, { count: suspendedUsers }, { count: activeSessions }, { data: transactions, error: transactionError }, { count: auditEvents }] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
            supabase.from('user_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true),
            supabase.from('transactions').select('amount'),
            supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        ]);
        if (transactionError) throw transactionError;
        const transactionVolume = (transactions || []).reduce((total, transaction) => total + Math.abs(Number(transaction.amount) || 0), 0);
        return response.json({ stats: { totalUsers: totalUsers || 0, activeUsers: activeUsers || 0, suspendedUsers: suspendedUsers || 0, activeSessions: activeSessions || 0, transactionVolume }, security: { auditEvents: auditEvents || 0 }, analytics: { transactionCount: (transactions || []).length } });
    } catch (error) { return next(error); }
});

app.get('/api/admin/users', async (request, response, next) => {
    try {
        if (!await requireAdmin(request, response)) return;
        const { data: users, error } = await supabase.from('users').select('id,full_name,email,phone,role,status,last_login_at,created_at').order('created_at', { ascending: false });
        if (error) throw error;
        return response.json({ users });
    } catch (error) { return next(error); }
});

app.post('/api/admin/admins', async (request, response, next) => {
    try {
        const admin = await requireAdmin(request, response);
        if (!admin) return;
        const { fullName, email, phone, password, confirmPassword } = request.body || {};
        if ([fullName, email, phone, password, confirmPassword].some(value => typeof value !== 'string' || !value.trim())) return response.status(400).json({ error: 'Complete every admin account field.' });
        if (password !== confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' });
        if (!passwordIsValid(password)) return response.status(422).json({ error: 'The temporary password must be at least 8 characters.' });
        if (await findUserByEmail(email)) return response.status(409).json({ error: 'An account with that email already exists.' });
        const passwordHash = await bcrypt.hash(password, 12);
        const { data: user, error } = await supabase.from('users').insert({ full_name: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password_hash: passwordHash, role: 'admin', status: 'active' }).select('id,full_name,email,phone,role,status,created_at').single();
        if (error) throw error;
        await recordAudit(admin.id, 'admin_created', user.id, { email: user.email });
        return response.status(201).json({ user });
    } catch (error) { return next(error); }
});

app.patch('/api/admin/users/:id', async (request, response, next) => {
    try {
        const admin = await requireAdmin(request, response);
        if (!admin) return;
        const { status } = request.body || {};
        if (!['active', 'suspended'].includes(status)) return response.status(400).json({ error: 'User status is invalid.' });
        if (request.params.id === admin.id) return response.status(400).json({ error: 'You cannot change your own status.' });
        const { data: target, error: targetError } = await supabase.from('users').select('id,role,status').eq('id', request.params.id).maybeSingle();
        if (targetError) throw targetError;
        if (!target) return response.status(404).json({ error: 'User was not found.' });
        if (target.role === 'admin') return response.status(403).json({ error: 'Administrator accounts cannot be changed here.' });
        const { data: user, error } = await supabase.from('users').update({ status }).eq('id', target.id).select('id,full_name,email,role,status').single();
        if (error) throw error;
        await recordAudit(admin.id, `user_${status}`, target.id, { previousStatus: target.status });
        return response.json({ user });
    } catch (error) { return next(error); }
});

app.get('/api/admin/sessions', async (request, response, next) => {
    try {
        if (!await requireAdmin(request, response)) return;
        const { data: sessions, error } = await supabase.from('user_sessions').select('id,user_id,login_at,last_seen_at,ip_address,user_agent,is_active').order('last_seen_at', { ascending: false }).limit(100);
        if (error) throw error;
        const userIds = [...new Set((sessions || []).map(session => session.user_id))];
        const { data: users, error: userError } = userIds.length ? await supabase.from('users').select('id,full_name,email').in('id', userIds) : { data: [], error: null };
        if (userError) throw userError;
        const userMap = new Map((users || []).map(user => [user.id, user]));
        return response.json({ sessions: (sessions || []).map(session => ({ ...session, user: userMap.get(session.user_id) || null })) });
    } catch (error) { return next(error); }
});

app.patch('/api/admin/sessions/:id', async (request, response, next) => {
    try {
        const admin = await requireAdmin(request, response);
        if (!admin) return;
        if (request.params.id === request.session.sessionId) return response.status(400).json({ error: 'You cannot revoke your current session.' });
        const { data: session, error } = await supabase.from('user_sessions').update({ is_active: false }).eq('id', request.params.id).eq('is_active', true).select('id,user_id').maybeSingle();
        if (error) throw error;
        if (!session) return response.status(404).json({ error: 'Active session was not found.' });
        await recordAudit(admin.id, 'session_revoked', session.user_id, { sessionId: session.id });
        return response.json({ message: 'Session revoked.' });
    } catch (error) { return next(error); }
});

app.get('/api/admin/audit', async (request, response, next) => {
    try {
        if (!await requireAdmin(request, response)) return;
        const { data: audit, error } = await supabase.from('audit_logs').select('id,actor_user_id,target_user_id,action,metadata,created_at').order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        const userIds = [...new Set((audit || []).flatMap(log => [log.actor_user_id, log.target_user_id]).filter(Boolean))];
        const { data: users, error: userError } = userIds.length ? await supabase.from('users').select('id,full_name,email').in('id', userIds) : { data: [], error: null };
        if (userError) throw userError;
        const userMap = new Map((users || []).map(user => [user.id, user]));
        return response.json({ audit: (audit || []).map(log => ({ ...log, actor: userMap.get(log.actor_user_id) || null, target: userMap.get(log.target_user_id) || null })) });
    } catch (error) { return next(error); }
});

app.get('/transactions.html', (request, response) => response.redirect('/transaction.html'));
app.get('/analytic.html', (request, response) => response.redirect('/analytics.html'));
app.get('/transfer', (request, response) => response.redirect('/transfer.html'));
app.use(express.static(__dirname));
app.use('/api', (request, response) => response.status(404).json({ error: 'API route not found.' }));
app.use((error, request, response, next) => {
    console.error(error);
    if (response.headersSent) return next(error);
    return response.status(500).json({ error: 'Unexpected server error.' });
});

if (require.main === module) {
    app.listen(port, () => console.log(`Bankease is running at http://localhost:${port}`));
}

module.exports = app;

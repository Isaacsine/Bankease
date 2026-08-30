require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('./supabase-client');

const app = express();
const port = process.env.PORT || 3000;
const sevenDays = 7;
const starterBanks = [
    { name: 'FNB', last_digits: '4589', balance: 0, full_name: 'First National Bank', account_type: 'cheque' },
    { name: 'Capitec', last_digits: '1234', balance: 0, full_name: 'Capitec Bank', account_type: 'savings' },
    { name: 'Absa', last_digits: '7890', balance: 0, full_name: 'Absa Bank', account_type: 'credit' },
    { name: 'Nedbank', last_digits: '5678', balance: 0, full_name: 'Nedbank', account_type: 'savings' },
    { name: 'Standard Bank', last_digits: '9012', balance: 0, full_name: 'Standard Bank', account_type: 'cheque' }
];

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieSession({
    name: 'bankees.sid',
    keys: [process.env.SESSION_SECRET || 'change-this-local-session-secret'],
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * sevenDays
}));

function publicUser(user) {
    return { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone, createdAt: user.created_at };
}

async function findUserByEmail(email) {
    if (typeof email !== 'string') return null;
    const { data, error } = await supabase.from('users').select('*').ilike('email', email.trim()).maybeSingle();
    if (error) throw error;
    return data;
}

async function createStarterBanks(userId) {
    const { error } = await supabase.from('banks').upsert(starterBanks.map(bank => ({ ...bank, user_id: userId })), { onConflict: 'user_id,name', ignoreDuplicates: true });
    if (error) throw error;
}

function requireUser(request, response) {
    if (!request.session.userId) {
        response.status(401).json({ error: 'Not logged in.' });
        return false;
    }
    return true;
}

function passwordResetTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function passwordIsValid(password) {
    return typeof password === 'string' && password.length >= 8;
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
        await createStarterBanks(user.id);
        request.session.userId = user.id;
        return response.status(201).json({ user: publicUser(user) });
    } catch (error) { return next(error); }
});

app.post('/api/login', async (request, response, next) => {
    try {
        const { email, password } = request.body || {};
        const user = await findUserByEmail(email);
        if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error: 'Email or password is incorrect.' });
        request.session = { userId: user.id };
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
        const { error: deleteError } = await supabase.from('password_reset_tokens').delete().eq('id', resetToken.id);
        if (deleteError) throw deleteError;
        return response.json({ message: 'Password updated successfully.' });
    } catch (error) { return next(error); }
});

app.post('/api/logout', (request, response) => {
    request.session = null;
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
        const { data: banks, error } = await supabase.from('banks').select('id,name,last_digits,balance,full_name,account_type').eq('user_id', request.session.userId).order('created_at');
        if (error) throw error;
        return response.json({ banks });
    } catch (error) { return next(error); }
});

app.post('/api/banks', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { name, accountNumber, balance, accountType } = request.body || {};
        const numericBalance = balance === undefined || balance === '' ? 0 : Number(balance);
        if (typeof name !== 'string' || !name.trim() || typeof accountNumber !== 'string' || !/^\d{4,}$/.test(accountNumber.replace(/\s/g, ''))) return response.status(400).json({ error: 'Enter a bank and a valid account number.' });
        if (!Number.isFinite(numericBalance) || numericBalance < 0) return response.status(422).json({ error: 'Balance must be zero or greater.' });
        const bank = { user_id: request.session.userId, name: name.trim(), last_digits: accountNumber.replace(/\s/g, '').slice(-4), balance: numericBalance, full_name: name.trim(), account_type: accountType || 'savings' };
        const { data, error } = await supabase.from('banks').insert(bank).select('id,name,last_digits,balance,full_name,account_type').single();
        if (error) {
            if (error.code === '23505') return response.status(409).json({ error: 'This bank is already linked.' });
            throw error;
        }
        return response.status(201).json({ bank: data });
    } catch (error) { return next(error); }
});

app.delete('/api/banks/:id', async (request, response, next) => {
    try {
        if (!requireUser(request, response)) return;
        const { data: deletedBank, error } = await supabase.from('banks').delete()
            .eq('id', request.params.id)
            .eq('user_id', request.session.userId)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!deletedBank) return response.status(404).json({ error: 'Linked account was not found.' });
        return response.status(204).end();
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
            const status = error.code === '22003' ? 409 : error.code === 'P0002' ? 404 : 400;
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
            const status = error.code === '22003' ? 409 : error.code === 'P0002' ? 404 : 400;
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

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/(rest\/v1|auth\/v1)\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey || !/^https:\/\//.test(supabaseUrl)) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY in the Render environment variables.');
}

const nativeFetch = globalThis.fetch;

async function supabaseFetch(input, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const canRetry = method === 'GET' || method === 'HEAD';
    const attempts = canRetry ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const requestInit = { ...init };
            if (!requestInit.signal && typeof AbortSignal?.timeout === 'function') {
                requestInit.signal = AbortSignal.timeout(15000);
            }
            return await nativeFetch(input, requestInit);
        } catch (error) {
            if (attempt === attempts - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }
}

module.exports = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: supabaseFetch }
});

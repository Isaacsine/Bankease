require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/(rest\/v1|auth\/v1)\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey || !/^https:\/\//.test(supabaseUrl)) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel Environment Variables.');
}

module.exports = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

require('dotenv').config();
const path = require('node:path');
const Database = require('better-sqlite3');
const supabase = require('./supabase-client');
async function migrate() {
    const database = new Database(path.join(__dirname, 'bankees.db'), { readonly: true });
    const users = database.prepare(`
        SELECT id, full_name, email, phone, password_hash, created_at
        FROM users
    `).all();
    database.close();

    if (users.length === 0) {
        console.log('No SQLite users found to migrate.');
        return;
    }

    const records = users.map(user => ({
        full_name: user.full_name,
        email: user.email.trim().toLowerCase(),
        phone: user.phone,
        password_hash: user.password_hash,
        created_at: user.created_at
    }));

    const { error } = await supabase.from('users').upsert(records, { onConflict: 'email' });
    if (error) throw error;

    console.log(`Migrated ${records.length} user(s) to Supabase.`);
}

migrate().catch(error => {
    console.error('Supabase migration failed:', error.message);
    process.exitCode = 1;
});

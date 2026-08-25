require('dotenv').config();
const path = require('node:path');
const Database = require('better-sqlite3');
const supabase = require('./supabase-client');
const starterBanks = [
    { name: 'FNB', last_digits: '4589', balance: 0, full_name: 'First National Bank', account_type: 'cheque' },
    { name: 'Capitec', last_digits: '1234', balance: 0, full_name: 'Capitec Bank', account_type: 'savings' },
    { name: 'Absa', last_digits: '7890', balance: 0, full_name: 'Absa Bank', account_type: 'credit' },
    { name: 'Nedbank', last_digits: '5678', balance: 0, full_name: 'Nedbank', account_type: 'savings' },
    { name: 'Standard Bank', last_digits: '9012', balance: 0, full_name: 'Standard Bank', account_type: 'cheque' }
];

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

    const { data: migratedUsers, error: usersError } = await supabase.from('users').select('id,email').in('email', records.map(record => record.email));
    if (usersError) throw usersError;
    const { error: banksError } = await supabase.from('banks').upsert(migratedUsers.flatMap(user => starterBanks.map(bank => ({ ...bank, user_id: user.id }))), { onConflict: 'user_id,name', ignoreDuplicates: true });
    if (banksError) throw banksError;
    console.log(`Migrated ${records.length} user(s) to Supabase.`);
}

migrate().catch(error => {
    console.error('Supabase migration failed:', error.message);
    process.exitCode = 1;
});

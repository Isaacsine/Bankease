const state = { overview: null, users: [], sessions: [], audit: [] };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `R${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const date = (value) => value ? new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

async function request(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
    if (!response.ok) {
        const error = new Error(result.error || 'The admin service is unavailable.');
        error.status = response.status;
        throw error;
    }
    return result;
}

function showMessage(text, type = 'error') {
    const message = $('#message');
    message.textContent = text;
    message.className = `message ${type}`;
    window.setTimeout(() => { message.textContent = ''; message.className = 'message'; }, 4500);
}

function renderOverview() {
    const { stats, security, analytics } = state.overview;
    $('#statGrid').innerHTML = [['users', stats.totalUsers, 'Registered users', 'fa-users'], ['active', stats.activeUsers, 'Active accounts', 'fa-user-check'], ['sessions', stats.activeSessions, 'Live sessions', 'fa-laptop'], ['volume', money(stats.transactionVolume), 'Transaction volume', 'fa-arrow-trend-up']].map(([key, value, label, icon]) => `<article class="stat-card"><span class="stat-icon ${key}"><i class="fas ${icon}"></i></span><strong>${value}</strong><span>${label}</span></article>`).join('');
    $('#snapshot').innerHTML = `<div class="snapshot-row"><span>Active users</span><strong>${stats.activeUsers} / ${stats.totalUsers}</strong></div><div class="snapshot-row"><span>Suspended accounts</span><strong>${stats.suspendedUsers}</strong></div><div class="snapshot-row"><span>Transactions processed</span><strong>${analytics.transactionCount}</strong></div><div class="snapshot-row"><span>Audit events</span><strong>${security.auditEvents}</strong></div>`;
    $('#securityGrid').innerHTML = [['Session protection', 'Cookie sessions use HttpOnly and SameSite controls.', 'Enabled', 'green'], ['Role enforcement', 'Every admin API request checks the current database role.', 'Enabled', 'green'], ['Suspended accounts', `${stats.suspendedUsers} account${stats.suspendedUsers === 1 ? '' : 's'} currently restricted.`, stats.suspendedUsers ? 'Review' : 'Clear', stats.suspendedUsers ? 'amber' : 'green'], ['Audit coverage', `${security.auditEvents} tracked administrative event${security.auditEvents === 1 ? '' : 's'}.`, 'Recording', 'blue']].map(([title, text, badge, color]) => `<article class="panel security-card"><div class="security-title"><span class="permission-icon ${color}"><i class="fas fa-shield-halved"></i></span><span class="status-pill ${color}">${badge}</span></div><h3>${title}</h3><p>${text}</p></article>`).join('');
    $('#analyticsGrid').innerHTML = `<article class="panel analytics-card"><p class="eyebrow">TRANSACTIONS</p><strong>${analytics.transactionCount}</strong><span>total transactions</span></article><article class="panel analytics-card"><p class="eyebrow">MONEY MOVEMENT</p><strong>${money(stats.transactionVolume)}</strong><span>recorded volume</span></article><article class="panel analytics-card"><p class="eyebrow">ADOPTION</p><strong>${stats.totalUsers ? Math.round(stats.activeUsers / stats.totalUsers * 100) : 0}%</strong><span>active user rate</span></article>`;
}

function renderUsers() {
    const query = ($('#userSearch').value || '').toLowerCase();
    $('#usersTable').innerHTML = state.users.filter(user => `${user.full_name} ${user.email}`.toLowerCase().includes(query)).map(user => `<tr><td><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></td><td><span class="role-badge ${escapeHtml(user.role)}">${escapeHtml(user.role)}</span></td><td><span class="status-pill ${user.status === 'active' ? 'healthy' : 'amber'}">${escapeHtml(user.status)}</span></td><td>${date(user.last_login_at)}</td><td>${date(user.created_at)}</td><td>${user.role === 'admin' ? '<span class="muted">Protected</span>' : `<button class="table-action" data-user-id="${escapeHtml(user.id)}" data-status="${user.status === 'active' ? 'suspended' : 'active'}">${user.status === 'active' ? 'Suspend' : 'Restore'}</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No users found.</td></tr>';
}

function renderSessions() { $('#sessionsTable').innerHTML = state.sessions.map(session => `<tr><td><strong>${escapeHtml(session.user?.full_name || 'Unknown user')}</strong><small>${escapeHtml(session.user?.email || '')}</small></td><td>${date(session.login_at)}</td><td>${date(session.last_seen_at)}</td><td>${escapeHtml(session.ip_address || 'Unavailable')}</td><td><span class="status-pill ${session.is_active ? 'healthy' : ''}">${session.is_active ? 'Active' : 'Ended'}</span></td><td>${session.is_active ? `<button class="table-action session-action" data-session-id="${escapeHtml(session.id)}">Revoke</button>` : '<span class="muted">Closed</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No sessions recorded.</td></tr>'; }
function renderAuditFilters() {
    const filter = $('#auditActionFilter');
    if (!filter) return;
    const selected = filter.value;
    const actions = [...new Set(state.audit.map(log => log.action).filter(Boolean))].sort();
    filter.innerHTML = '<option value="">All actions</option>' + actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('');
    filter.value = actions.includes(selected) ? selected : '';
}

function filteredAudit() {
    const query = ($('#auditSearch')?.value || '').toLowerCase();
    const action = $('#auditActionFilter')?.value || '';
    return state.audit.filter(log => {
        const searchable = `${log.action} ${log.actor?.full_name || ''} ${log.target?.full_name || ''} ${JSON.stringify(log.metadata || {})}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!action || log.action === action);
    });
}

function renderAudit() { $('#auditTable').innerHTML = filteredAudit().map(log => `<tr><td><strong>${escapeHtml(log.action)}</strong></td><td>${escapeHtml(log.actor?.full_name || 'System')}</td><td>${escapeHtml(log.target?.full_name || 'System')}</td><td>${escapeHtml(JSON.stringify(log.metadata || {}))}</td><td>${date(log.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No audit events match your filters.</td></tr>'; }

async function load() {
    try {
        const me = await request('/api/me');
        if (me.user.role !== 'admin') throw new Error('Administrator access is required.');
        $('#adminName').textContent = me.user.fullName || me.user.email;
        const [overview, users, sessions, audit] = await Promise.all([request('/api/admin/overview'), request('/api/admin/users'), request('/api/admin/sessions'), request('/api/admin/audit')]);
        state.overview = overview; state.users = users.users; state.sessions = sessions.sessions; state.audit = audit.audit;
        renderOverview(); renderUsers(); renderSessions(); renderAuditFilters(); renderAudit();
        $('#lastUpdated').textContent = `Updated ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
        showMessage(error.message);
        if (error.status === 403 || error.message === 'Administrator access is required.') {
            $('#adminName').textContent = 'Signed in without admin access';
            return;
        }
        window.setTimeout(() => { window.location.href = '../login.html'; }, 1600);
    }
}

document.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-view]');
    if (nav) { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $(`#view-${nav.dataset.view}`).classList.add('active-view'); document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === nav.dataset.view)); $('#pageTitle').textContent = nav.dataset.view[0].toUpperCase() + nav.dataset.view.slice(1); return; }
    const action = event.target.closest('.table-action:not(.session-action)');
    if (action) { try { await request(`/api/admin/users/${action.dataset.userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action.dataset.status }) }); await load(); showMessage('User status updated.', 'success'); } catch (error) { showMessage(error.message); } }
    const sessionAction = event.target.closest('.session-action');
    if (sessionAction) { try { await request(`/api/admin/sessions/${sessionAction.dataset.sessionId}`, { method: 'PATCH' }); await load(); showMessage('Session revoked.', 'success'); } catch (error) { showMessage(error.message); } }
    if (event.target.closest('#logoutButton')) { await request('/api/logout', { method: 'POST' }); window.location.href = '../login.html'; }
});
$('#createAdminForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
        await request('/api/admin/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        await load();
        showMessage('Admin account created. Share the temporary password securely.', 'success');
    } catch (error) { showMessage(error.message); } finally { button.disabled = false; }
});
$('#userSearch').addEventListener('input', renderUsers);
$('#auditSearch')?.addEventListener('input', renderAudit);
$('#auditActionFilter')?.addEventListener('change', renderAudit);
$('#exportAudit')?.addEventListener('click', () => {
    const rows = filteredAudit();
    const csvValue = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [['Action', 'Actor', 'Target', 'Details', 'Time'], ...rows.map(log => [log.action, log.actor?.full_name || 'System', log.target?.full_name || 'System', JSON.stringify(log.metadata || {}), date(log.created_at)])].map(row => row.map(csvValue).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `bankease-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
});
$('#refreshButton')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await load(); showMessage('Admin data refreshed.', 'success'); } catch (error) { showMessage(error.message); } finally { button.disabled = false; }
});
load();

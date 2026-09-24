// ============================================================
// script.js - All JavaScript logic
// ============================================================

(function() {
    // ---------- DATA ----------
    let banks = [];
    let selectedId = null;
    let transactions = [
        { title: 'ATM Withdrawal', bank: 'FNB **** 4589', amount: -1000, time: 'Today, 10:45 AM', icon: 'fa-money-bill-wave' },
        { title: 'POS Purchase', bank: 'Capitec **** 1234', amount: -250, time: 'Yesterday, 4:30 PM', icon: 'fa-shopping-cart' },
        { title: 'Salary Deposit', bank: 'FNB **** 4589', amount: 12500, time: 'Yesterday, 9:00 AM', icon: 'fa-wallet' },
        { title: 'Transfer to FNB', bank: 'Capitec **** 1234', amount: -1000, time: 'Dec 14, 2024', icon: 'fa-exchange-alt' },
        { title: 'Spar Purchase', bank: 'FNB **** 4589', amount: -245.50, time: 'Today, 14:32', icon: 'fa-shopping-bag' }
    ];

    const bankStyles = {
        'FNB': { bg: '#005baa', logo: 'assets/fnblogo.png' },
        'Capitec': { bg: '#e31e24', logo: 'assets/capitec.jpg' },
        'Absa': { bg: '#002f6c', logo: 'assets/absa-bank%20logo.png' },
        'Nedbank': { bg: '#1a4d8c', logo: 'assets/nedbank.png' },
        'Standard Bank': { bg: '#004d3d', logo: 'assets/standardbank.jpg' },
        'TymeBank': { bg: '#00a651', logo: 'assets/tynebank.png' },
        'Bank Zero': { bg: '#7b7b8d', icon: 'fa-zero' }
    };

    function getBankStyle(name) {
        return bankStyles[name] || { bg: '#6c757d' };
    }

    function normalizeBank(bank) {
        return { ...bank, lastDigits: bank.last_digits, fullName: bank.full_name, type: bank.account_type };
    }

    async function loadUserData() {
        const [userResponse, banksResponse, transactionsResponse] = await Promise.all([fetch('/api/me'), fetch('/api/banks'), fetch('/api/transactions')]);
        if (!userResponse.ok || !banksResponse.ok || !transactionsResponse.ok) {
            window.location.href = 'login.html';
            return;
        }
        const userResult = await userResponse.json();
        const banksResult = await banksResponse.json();
        const transactionsResult = await transactionsResponse.json();
        const greeting = document.querySelector('.greeting h2');
        if (greeting) greeting.textContent = 'Hello, ' + userResult.user.fullName;
        banks = banksResult.banks.map(normalizeBank);
        transactions = transactionsResult.transactions.map(transaction => ({
            title: transaction.title,
            bank: '',
            amount: Number(transaction.amount),
            time: new Date(transaction.created_at).toLocaleString(),
            icon: transaction.title.toLowerCase().includes('transfer') ? 'fa-exchange-alt' : 'fa-receipt'
        }));
        selectedId = banks[0]?.id || null;
        renderAll();
    }

    function renderBankIcon(bank, style, size) {
        return style.logo
            ? `<img src="${style.logo}" alt="${bank.name} logo" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;background:#fff;flex-shrink:0;">`
            : `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${style.bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.4)}px;font-weight:700;flex-shrink:0;">${bank.name.charAt(0)}</span>`;
    }

    // DOM refs
    const bankListEl = document.getElementById('bankList');
    const bankDetailContainer = document.getElementById('bankDetailContainer');
    const totalBalanceEl = document.getElementById('totalBalance');
    const accountCountEl = document.getElementById('accountCount');
    const activeBankNameEl = document.getElementById('activeBankName');
    const addBankBtn = document.getElementById('addBankBtn');
    const modalOverlay = document.getElementById('addBankModal');
    const modalBankSelect = document.getElementById('modalBankSelect');
    const modalAccount = document.getElementById('modalAccount');
    const modalBalance = document.getElementById('modalBalance');
    const modalAccountType = document.getElementById('modalAccountType');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');

    // Page elements
    const settingsPage = document.getElementById('settingsPage');
    const transferPage = document.getElementById('transferPage');
    const airtimePage = document.getElementById('airtimePage');
    const cardPage = document.getElementById('cardPage');
    const transferFrom = document.getElementById('transferFrom');
    const transferTo = document.getElementById('transferTo');
    const transferAmount = document.getElementById('transferAmount');
    const transferBtn = document.getElementById('transferBtn');
    const transferMsg = document.getElementById('transferMsg');
    const airtimeNetwork = document.getElementById('airtimeNetwork');
    const serviceType = document.getElementById('serviceType');
    const serviceProviderLabel = document.getElementById('serviceProviderLabel');
    const serviceRecipientLabel = document.getElementById('serviceRecipientLabel');
    const serviceAvailability = document.getElementById('serviceAvailability');
    const airtimePhone = document.getElementById('airtimePhone');
    const airtimeAmount = document.getElementById('airtimeAmount');
    const airtimeBank = document.getElementById('airtimeBank');
    const buyAirtimeBtn = document.getElementById('buyAirtimeBtn');
    const airtimeMsg = document.getElementById('airtimeMsg');
    const defaultBankSelect = document.getElementById('defaultBankSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const privacyToggle = document.getElementById('privacyToggle');
    const transferRail = document.getElementById('transferRail');
    const goalForm = document.getElementById('goalForm');
    const reminderForm = document.getElementById('reminderForm');
    const dropTransferPrompt = document.getElementById('dropTransferPrompt');
    const dropTransferText = document.getElementById('dropTransferText');
    const dropTransferButton = document.getElementById('dropTransferButton');
    const dropTransferCancel = document.getElementById('dropTransferCancel');
    let pendingTransfer = { fromId: null, toId: null };
    let touchDragState = null;

    const storageKeys = {
        goals: 'bankease-savings-goals',
        reminders: 'bankease-bill-reminders'
    };

    // ---------- HELPERS ----------
    function formatCurrency(amount) {
        return 'R' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function updateTotalBalance() {
        let total = banks.reduce((sum, b) => sum + b.balance, 0);
        if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(total);
        if (accountCountEl) accountCountEl.textContent = 'Across ' + banks.length + ' accounts';
        const active = banks.find(b => b.id === selectedId);
        if (activeBankNameEl) activeBankNameEl.textContent = active ? active.name + ' **** ' + active.lastDigits : 'â€”';
    }

    function getActiveBank() {
        return banks.find(b => b.id === selectedId);
    }

    function transactionDate(transaction) {
        const date = new Date(transaction.created_at || transaction.time);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function readStoredList(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    function writeStoredList(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function createLocalId() {
        return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function spendingCategory(title) {
        const normalized = title.toLowerCase();
        if (/airtime|data|vodacom|mtn|telkom|cell c/.test(normalized)) return 'Mobile';
        if (/transfer/.test(normalized)) return 'Transfers';
        if (/salary|payroll|income|deposit/.test(normalized)) return 'Income';
        if (/spar|checkers|shoprite|pick n pay|woolworth|grocery|food/.test(normalized)) return 'Groceries';
        if (/atm|cash/.test(normalized)) return 'Cash';
        if (/rent|electric|water|bill|subscription/.test(normalized)) return 'Bills';
        return 'Everyday';
    }

    function renderFinancialTools() {
        const categoryEl = document.getElementById('spendingCategories');
        const salaryEl = document.getElementById('salaryInsight');
        const safeSpendEl = document.getElementById('safeToSpend');
        const safeCaptionEl = document.getElementById('safeSpendCaption');
        const commitmentCountEl = document.getElementById('commitmentCount');
        if (!categoryEl || !salaryEl || !safeSpendEl || !safeCaptionEl || !commitmentCountEl) return;

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthlySpending = transactions.filter(transaction => transaction.amount < 0 && transactionDate(transaction)?.getTime() >= monthStart);
        const categories = monthlySpending.reduce((result, transaction) => {
            const name = spendingCategory(transaction.title);
            result[name] = (result[name] || 0) + Math.abs(transaction.amount);
            return result;
        }, {});
        const categoryRows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
        const largestCategory = categoryRows[0]?.[1] || 0;
        categoryEl.innerHTML = categoryRows.length ? categoryRows.slice(0, 5).map(([name, amount]) => `<div class="category-row"><span class="category-name">${escapeHtml(name)}</span><span class="category-track"><span class="category-fill" style="width:${Math.max(8, Math.round((amount / largestCategory) * 100))}%"></span></span><span class="category-amount">${formatCurrency(amount)}</span></div>`).join('') : '<p class="tool-empty">Your categories will appear as you transact.</p>';

        const salaryTransactions = transactions.filter(transaction => transaction.amount > 0 && /salary|payroll|wage|income/.test(transaction.title.toLowerCase()));
        salaryEl.textContent = salaryTransactions.length ? `Salary pattern: ${formatCurrency(salaryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) / salaryTransactions.length)}` : 'No salary pattern yet';

        const reminders = readStoredList(storageKeys.reminders).filter(reminder => reminder.date && new Date(reminder.date + 'T23:59:59') >= now);
        const upcomingCommitments = reminders.filter(reminder => new Date(reminder.date + 'T00:00:00') <= new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000))).reduce((sum, reminder) => sum + Number(reminder.amount || 0), 0);
        const totalBalance = banks.reduce((sum, bank) => sum + Number(bank.balance || 0), 0);
        safeSpendEl.textContent = formatCurrency(Math.max(0, totalBalance - upcomingCommitments));
        safeCaptionEl.textContent = upcomingCommitments ? 'Your balance after the next 30 days of saved commitments.' : 'Your balance after saved commitments.';
        commitmentCountEl.textContent = reminders.length ? `${reminders.length} upcoming ${reminders.length === 1 ? 'commitment' : 'commitments'}` : 'No upcoming commitments';

        renderGoals();
        renderReminders();
    }

    function renderGoals() {
        const goalList = document.getElementById('goalList');
        if (!goalList) return;
        const goals = readStoredList(storageKeys.goals);
        goalList.innerHTML = goals.length ? goals.map(goal => `<div class="planning-item"><div class="planning-item-details"><span class="planning-item-name">${escapeHtml(goal.name)}</span><span class="planning-item-sub">Target ${formatCurrency(Number(goal.target))}</span></div><span class="planning-item-amount">0%</span><button class="planning-remove" type="button" data-remove-goal="${escapeHtml(goal.id)}" aria-label="Remove ${escapeHtml(goal.name)}" title="Remove goal"><i class="fas fa-xmark"></i></button></div>`).join('') : '<p class="tool-empty">Add a goal to give your money a direction.</p>';
    }

    function renderReminders() {
        const reminderList = document.getElementById('reminderList');
        if (!reminderList) return;
        const reminders = readStoredList(storageKeys.reminders).filter(reminder => reminder.date && new Date(reminder.date + 'T23:59:59') >= new Date()).sort((a, b) => a.date.localeCompare(b.date));
        reminderList.innerHTML = reminders.length ? reminders.map(reminder => `<div class="planning-item"><div class="planning-item-details"><span class="planning-item-name">${escapeHtml(reminder.name)}</span><span class="planning-item-sub">Due ${escapeHtml(reminder.date)}</span></div><span class="planning-item-amount">${formatCurrency(Number(reminder.amount))}</span><button class="planning-remove" type="button" data-remove-reminder="${escapeHtml(reminder.id)}" aria-label="Remove ${escapeHtml(reminder.name)}" title="Remove reminder"><i class="fas fa-xmark"></i></button></div>`).join('') : '<p class="tool-empty">Add bills to make safe-to-spend more accurate.</p>';
    }

    function renderMoneyPulse() {
        const scoreEl = document.getElementById('pulseScore');
        const insightEl = document.getElementById('pulseInsight');
        const incomeEl = document.getElementById('pulseIncome');
        const spendingEl = document.getElementById('pulseSpending');
        const activityEl = document.getElementById('pulseActivity');
        if (!scoreEl || !insightEl || !incomeEl || !spendingEl || !activityEl) return;

        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recent = transactions.filter(transaction => {
            const date = transactionDate(transaction);
            return date && date.getTime() >= cutoff;
        });
        const income = recent.filter(transaction => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0);
        const spending = recent.filter(transaction => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
        const totalBalance = banks.reduce((sum, bank) => sum + Number(bank.balance || 0), 0);
        const bufferRatio = spending > 0 ? totalBalance / spending : totalBalance > 0 ? 3 : 0;
        const score = totalBalance === 0 && spending === 0 ? 0 : Math.max(20, Math.min(99, Math.round(45 + (bufferRatio * 15))));

        scoreEl.textContent = score ? score + '/100' : '--';
        incomeEl.textContent = formatCurrency(income);
        spendingEl.textContent = formatCurrency(spending);
        activityEl.textContent = recent.length;

        if (!banks.length) {
            insightEl.textContent = 'Link an account to unlock your personal money snapshot.';
        } else if (!recent.length) {
            insightEl.textContent = 'Your pulse is ready. New activity will turn this into a living view of your money.';
        } else if (spending > income && income > 0) {
            insightEl.textContent = 'Your outflow is ahead of your inflow this month. Review your recent activity before your next big spend.';
        } else if (bufferRatio >= 2) {
            insightEl.textContent = 'You have a healthy balance buffer against your recent outflow. Keep the momentum going.';
        } else {
            insightEl.textContent = 'Your balance is close to your recent monthly outflow. A small buffer goal could give you more breathing room.';
        }
    }

    function setPrivacyMode(hidden) {
        document.body.classList.toggle('privacy-mode', hidden);
        if (privacyToggle) {
            privacyToggle.setAttribute('aria-label', hidden ? 'Show balances' : 'Hide balances');
            privacyToggle.setAttribute('title', hidden ? 'Show balances' : 'Hide balances');
            privacyToggle.innerHTML = `<i class="fas ${hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
        }
        localStorage.setItem('bankease-privacy-mode', hidden ? 'hidden' : 'visible');
    }

    function configureServiceForm() {
        if (!serviceType || !airtimeNetwork || !serviceProviderLabel || !serviceRecipientLabel || !serviceAvailability || !buyAirtimeBtn) return;
        const type = serviceType.value;
        const catalog = {
            airtime: { label: 'Network', providers: ['Vodacom', 'MTN', 'Cell C', 'Telkom'], recipient: 'Cellphone Number', placeholder: '082 123 4567', available: true },
            data: { label: 'Network', providers: ['Vodacom', 'MTN', 'Cell C', 'Telkom'], recipient: 'Cellphone Number', placeholder: '082 123 4567', available: false },
            electricity: { label: 'Provider', providers: ['Eskom', 'City Power', 'Ethekwini Municipality', 'Cape Town Electricity'], recipient: 'Meter Number', placeholder: 'Enter meter number', available: false },
            gaming: { label: 'Voucher', providers: ['1Voucher', 'OTT Voucher', 'Hollywoodbets', 'Betway'], recipient: 'Recipient or account number', placeholder: 'Enter recipient details', available: false },
            voucher: { label: 'Voucher brand', providers: ['Takealot', 'Checkers', 'Woolworths', 'Uber'], recipient: 'Recipient email or phone', placeholder: 'Enter recipient details', available: false }
        }[type];
        airtimeNetwork.innerHTML = catalog.providers.map(provider => `<option>${provider}</option>`).join('');
        serviceProviderLabel.textContent = catalog.label;
        serviceRecipientLabel.textContent = catalog.recipient;
        document.getElementById('airtimePhone').placeholder = catalog.placeholder;
        document.getElementById('airtimePhone').setAttribute('aria-label', catalog.recipient);
        serviceAvailability.className = catalog.available ? 'service-availability' : 'service-availability pending';
        serviceAvailability.innerHTML = catalog.available ? '<i class="fas fa-circle-check"></i> Airtime is available now' : '<i class="fas fa-plug-circle-xmark"></i> Provider connection required before purchase';
        buyAirtimeBtn.innerHTML = catalog.available ? 'Buy airtime' : 'Connect provider';
    }

    function clearDropTransfer() {
        pendingTransfer = { fromId: null, toId: null };
        if (dropTransferPrompt) dropTransferPrompt.hidden = true;
        bankListEl?.querySelectorAll('.drag-target, .long-pressing').forEach(item => item.classList.remove('drag-target', 'long-pressing'));
    }

    function showDropTransfer(fromId, toId) {
        const fromBank = banks.find(bank => bank.id === fromId);
        const toBank = banks.find(bank => bank.id === toId);
        if (!fromBank || !toBank || fromId === toId) return;
        pendingTransfer = { fromId, toId };
        if (dropTransferText) dropTransferText.textContent = `Transfer from ${fromBank.name} to ${toBank.name}`;
        if (dropTransferPrompt) dropTransferPrompt.hidden = false;
        bankListEl?.querySelectorAll('.drag-target, .long-pressing').forEach(item => item.classList.remove('drag-target', 'long-pressing'));
    }

    function targetBankAtPoint(clientX, clientY) {
        const element = document.elementFromPoint(clientX, clientY)?.closest('.bank-item');
        return element && bankListEl?.contains(element) ? element : null;
    }

    function finishTouchDrag(event) {
        if (!touchDragState) return;
        const state = touchDragState;
        touchDragState = null;
        clearTimeout(state.timer);
        if (!state.active) return;
        event.preventDefault();
        const target = targetBankAtPoint(event.clientX, event.clientY);
        if (target && target.dataset.id !== state.sourceId) showDropTransfer(state.sourceId, target.dataset.id);
        else clearDropTransfer();
    }

    // ---------- RENDER BANK LIST ----------
    function renderBankList() {
        bankListEl.innerHTML = banks.map(bank => {
            const style = getBankStyle(bank.name);
            const selected = bank.id === selectedId ? 'active' : '';
            return `<div class="bank-item ${selected}" data-id="${bank.id}" draggable="true" title="Drag this account onto another account to transfer">
                <div style="display:flex;align-items:center;gap:12px;flex:1;">
                    ${renderBankIcon(bank, style, 36)}
                    <div>
                        <div class="bank-name">${bank.name}</div>
                        <div class="bank-detail">${bank.fullName}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div class="bank-balance">${formatCurrency(bank.balance)}</div>
                    <div class="bank-detail">${bank.type}</div>
                </div>
            </div>`;
        }).join('');

        bankListEl.querySelectorAll('.bank-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                if (id !== selectedId) {
                    selectedId = id;
                    renderAll();
                }
            });
            el.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', el.dataset.id);
                event.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                bankListEl.querySelectorAll('.drag-target').forEach(target => target.classList.remove('drag-target'));
            });
            el.addEventListener('dragover', event => {
                if (Array.from(event.dataTransfer.types).includes('text/plain')) {
                    event.preventDefault();
                    el.classList.add('drag-target');
                }
            });
            el.addEventListener('dragleave', () => el.classList.remove('drag-target'));
            el.addEventListener('drop', event => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData('text/plain');
                const toId = el.dataset.id;
                el.classList.remove('drag-target');
                if (!fromId || fromId === toId) return;
                showDropTransfer(fromId, toId);
            });
            el.addEventListener('pointerdown', event => {
                if (event.pointerType === 'mouse') return;
                clearTimeout(touchDragState?.timer);
                touchDragState = { sourceId: el.dataset.id, active: false, timer: setTimeout(() => {
                    touchDragState.active = true;
                    el.classList.add('long-pressing');
                    bankListEl.querySelectorAll('.bank-item').forEach(item => item.classList.add('drag-target'));
                    el.classList.remove('drag-target');
                }, 500) };
            });
            el.addEventListener('pointermove', event => {
                if (!touchDragState?.active) return;
                event.preventDefault();
                bankListEl.querySelectorAll('.drag-target').forEach(item => item.classList.remove('drag-target'));
                const target = targetBankAtPoint(event.clientX, event.clientY);
                if (target && target.dataset.id !== touchDragState.sourceId) target.classList.add('drag-target');
            });
            el.addEventListener('pointerup', finishTouchDrag);
            el.addEventListener('pointercancel', finishTouchDrag);
        });
        updateTotalBalance();
    }

    // ---------- RENDER BANK DETAIL ----------
    function renderBankDetail() {
        const bank = getActiveBank();
        if (!bank) {
            bankDetailContainer.innerHTML = '';
            return;
        }

        const style = getBankStyle(bank.name);
        const txns = transactions.filter(t => !t.bank || t.bank.includes(bank.name));

        bankDetailContainer.innerHTML = `
            <div style="padding:4px 0;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                    <div>
                        <div style="display:flex;align-items:center;gap:12px;">
                            ${renderBankIcon(bank, style, 44)}
                            <div>
                                <div class="bank-detail-name">${bank.name}</div>
                                <div class="bank-detail-sub">${bank.fullName}</div>
                            </div>
                        </div>
                    </div>
                    <div class="bank-detail-status">Active</div>
                </div>
                
                <div class="bank-detail-balance">
                    <div class="label">Available Balance</div>
                    <div class="amount">${formatCurrency(bank.balance)}</div>
                    <div style="font-size:12px;color:#7b7b8d;margin-top:4px;">${bank.type}</div>
                </div>
                
                <div style="font-size:13px;color:#7b7b8d;margin-bottom:12px;">
                    Use ${bank.name} with your Bankease SmartCard
                </div>
                
                <div class="bank-detail-actions">
                    <button class="btn-use" data-page="transfer"><i class="fas fa-exchange-alt"></i> Transfer</button>
                    <button class="btn-secondary" data-page="airtime"><i class="fas fa-phone-alt"></i> Airtime</button>
                    <button class="btn-secondary" data-page="settings"><i class="fas fa-cog"></i> Manage</button>
                </div>
                
                <div style="margin-top:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h4 style="font-size:15px;color:#1a1a2e;">Recent Transactions</h4>
                        <a href="transaction.html" style="font-size:12px;color:#7b7b8d;text-decoration:none;font-weight:500;">View All</a>
                    </div>
                    ${txns.length === 0 ? '<p style="color:#7b7b8d;padding:12px 0;text-align:center;">No transactions yet.</p>' : 
                        txns.slice(0, 5).map(tx => `
                            <div class="recent-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5;">
                                <div class="left" style="display:flex;align-items:center;gap:12px;">
                                    <div class="icon" style="width:36px;height:36px;border-radius:50%;background:#f5f7fa;display:flex;align-items:center;justify-content:center;font-size:14px;color:#1a1a2e;">
                                        <i class="fas ${tx.icon}"></i>
                                    </div>
                                    <div class="info">
                                        <div class="desc" style="font-weight:600;color:#1a1a2e;font-size:14px;">${tx.title}</div>
                                        <div class="date" style="font-size:11px;color:#7b7b8d;">${tx.time}</div>
                                    </div>
                                </div>
                                <div class="amount ${tx.amount < 0 ? 'negative' : 'positive'}" style="font-weight:600;font-size:14px;">
                                    ${formatCurrency(tx.amount)}
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;

        // Attach quick action listeners
        bankDetailContainer.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                openPage(page);
            });
        });

        updateTotalBalance();
    }

    // ---------- PAGE SYSTEM ----------
    function hideAllPages() {
        const pages = ['settingsPage', 'transferPage', 'airtimePage', 'cardPage'];
        pages.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });
        if (bankDetailContainer) {
            bankDetailContainer.style.display = 'block';
        }
    }

    function openPage(page) {
        hideAllPages();

        if (page === 'settings') {
            settingsPage.style.display = 'block';
            settingsPage.classList.add('active');
            populateDefaultBankSelect();
        } else if (page === 'transfer') {
            transferPage.style.display = 'block';
            transferPage.classList.add('active');
            populateTransferSelects();
        } else if (page === 'airtime') {
            airtimePage.style.display = 'block';
            airtimePage.classList.add('active');
            populateAirtimeBankSelect();
        } else if (page === 'card') {
            cardPage.style.display = 'block';
            cardPage.classList.add('active');
        } else {
            bankDetailContainer.style.display = 'block';
        }

        // Update nav
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        if (page === 'dashboard') {
            document.querySelector('.nav-item[data-page="dashboard"]')?.classList.add('active');
        } else if (page === 'transfer') {
            document.querySelector('.nav-item[data-page="transfer"]')?.classList.add('active');
        } else if (page === 'airtime') {
            document.querySelector('.nav-item[data-page="airtime"]')?.classList.add('active');
        } else if (page === 'settings') {
            document.querySelector('.nav-item[data-page="settings"]')?.classList.add('active');
        }
    }

    // Populate transfer selects
    function populateTransferSelects() {
        const from = document.getElementById('transferFrom');
        const to = document.getElementById('transferTo');
        if (from && to) {
            from.innerHTML = banks.map(b => `<option value="${b.id}">${b.name} (${formatCurrency(b.balance)})</option>`).join('');
            to.innerHTML = banks.map(b => `<option value="${b.id}">${b.name} (${formatCurrency(b.balance)})</option>`).join('');
            if (pendingTransfer.fromId && banks.some(bank => bank.id === pendingTransfer.fromId)) from.value = pendingTransfer.fromId;
            if (pendingTransfer.toId && banks.some(bank => bank.id === pendingTransfer.toId)) to.value = pendingTransfer.toId;
            if (from.value === to.value && to.options.length > 1) to.selectedIndex = to.selectedIndex === 0 ? 1 : 0;
        }
    }

    function populateAirtimeBankSelect() {
        const sel = document.getElementById('airtimeBank');
        if (sel) {
            sel.innerHTML = banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }
    }

    function populateDefaultBankSelect() {
        const sel = document.getElementById('defaultBankSelect');
        if (sel) {
            sel.innerHTML = banks.map(b => `<option value="${b.id}" ${b.id === selectedId ? 'selected' : ''}>${b.name}</option>`).join('');
        }
    }

    // ---------- ADD BANK ----------
    async function addBank() {
        const name = modalBankSelect.value;
        const accountNum = modalAccount.value.replace(/\s/g, '');
        if (!/^\d{4}$/.test(accountNum)) {
            return alert('Enter exactly the last 4 digits of the account or card.');
        }
        const balance = parseFloat(modalBalance.value) || 0;
        const type = modalAccountType ? modalAccountType.value : 'Cheque Account';
        const fullName = name;

        const response = await fetch('/api/banks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, accountNumber: accountNum, balance, accountType: type }) });
        const result = await response.json();
        if (!response.ok) return alert(result.error || 'Could not add bank.');
        const newBank = normalizeBank(result.bank);
        banks.push(newBank);

        selectedId = newBank.id;
        renderAll();
        modalOverlay.style.display = 'none';
        modalOverlay.classList.remove('open');

        // Clear fields
        modalAccount.value = '';
        modalBalance.value = '0';
    }

    // ---------- TRANSFER ----------
    async function doTransfer() {
        const fromId = document.getElementById('transferFrom').value;
        const toId = document.getElementById('transferTo').value;
        const amount = parseFloat(document.getElementById('transferAmount').value);

        if (transferRail?.value === 'payshap') {
            transferMsg.textContent = 'PayShap is ready for provider connection, but is not live in this version.';
            transferMsg.style.color = '#b26a00';
            return;
        }

        if (fromId === toId) {
            transferMsg.textContent = 'âŒ Cannot transfer to same bank.';
            transferMsg.style.color = '#e74c3c';
            return;
        }
        if (!amount || amount <= 0) {
            transferMsg.textContent = 'âŒ Enter a valid amount.';
            transferMsg.style.color = '#e74c3c';
            return;
        }

        const fromBank = banks.find(b => b.id === fromId);
        const toBank = banks.find(b => b.id === toId);

        if (!fromBank || !toBank) {
            transferMsg.textContent = 'âŒ Bank not found.';
            transferMsg.style.color = '#e74c3c';
            return;
        }
        if (fromBank.balance < amount) {
            transferMsg.textContent = 'âŒ Insufficient balance in ' + fromBank.name;
            transferMsg.style.color = '#e74c3c';
            return;
        }

        const response = await fetch('/api/transfers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromId, toId, amount })
        });
        const result = await response.json();
        if (!response.ok) {
            transferMsg.textContent = 'âŒ ' + (result.error || 'Transfer failed.');
            transferMsg.style.color = '#e74c3c';
            return;
        }
        transferMsg.textContent = 'âœ… Transfer completed successfully.';
        transferMsg.style.color = '#27ae60';
        await loadUserData();
        populateTransferSelects();
        pendingTransfer = { fromId: null, toId: null };
        document.getElementById('transferAmount').value = '';
    }

    // ---------- AIRTIME ----------
    async function buyAirtime() {
        const selectedService = serviceType?.value || 'airtime';
        if (selectedService !== 'airtime') {
            airtimeMsg.textContent = 'This service is ready for provider connection, but is not live yet.';
            airtimeMsg.style.color = '#a36200';
            return;
        }
        const network = document.getElementById('airtimeNetwork').value;
        const phone = document.getElementById('airtimePhone').value.trim();
        const amount = parseFloat(document.getElementById('airtimeAmount').value);
        const bankId = document.getElementById('airtimeBank').value;

        if (!phone) {
            airtimeMsg.textContent = 'âŒ Enter a cellphone number.';
            airtimeMsg.style.color = '#e74c3c';
            return;
        }
        if (!amount || amount <= 0) {
            airtimeMsg.textContent = 'âŒ Enter a valid amount.';
            airtimeMsg.style.color = '#e74c3c';
            return;
        }

        const bank = banks.find(b => b.id === bankId);
        if (!bank) {
            airtimeMsg.textContent = 'âŒ Bank not found.';
            airtimeMsg.style.color = '#e74c3c';
            return;
        }
        if (bank.balance < amount) {
            airtimeMsg.textContent = 'âŒ Insufficient balance in ' + bank.name;
            airtimeMsg.style.color = '#e74c3c';
            return;
        }

        const response = await fetch('/api/airtime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ network, phone, amount, bankId })
        });
        const result = await response.json();
        if (!response.ok) {
            airtimeMsg.textContent = '❌ ' + (result.error || 'Airtime purchase failed.');
            airtimeMsg.style.color = '#e74c3c';
            return;
        }

        airtimeMsg.textContent = '✅ Airtime for ' + network + ' (' + phone + ') purchased successfully!';
        airtimeMsg.style.color = '#27ae60';
        await loadUserData();
        populateAirtimeBankSelect();
        document.getElementById('airtimePhone').value = '';
        document.getElementById('airtimeAmount').value = '';
    }

    // ---------- SAVE SETTINGS ----------
    function saveSettings() {
        const defaultBankId = document.getElementById('defaultBankSelect').value;
        if (defaultBankId) {
            selectedId = defaultBankId;
            renderAll();
            const msg = document.querySelector('#settingsPage p');
            if (msg) {
                msg.textContent = 'âœ… Settings saved! Default bank updated to ' + banks.find(b => b.id === defaultBankId)?.name;
                msg.style.color = '#27ae60';
                setTimeout(() => {
                    msg.textContent = 'Manage your Bankease preferences.';
                    msg.style.color = '#7b7b8d';
                }, 3000);
            }
        }
    }

    // ---------- RENDER ALL ----------
    function renderAll() {
        if (!bankListEl || !bankDetailContainer) return;
        renderBankList();
        renderBankDetail();
        updateTotalBalance();
        renderMoneyPulse();
        renderFinancialTools();
        bankDetailContainer.style.display = 'block';
    }

    // ---------- EVENT LISTENERS ----------
    // Add Bank - show modal
    if (addBankBtn) {
        addBankBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'flex';
            modalOverlay.classList.add('open');
        });
    }

    // Modal cancel/close
    if (modalCancel) {
        modalCancel.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
            modalOverlay.classList.remove('open');
        });
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
                modalOverlay.classList.remove('open');
            }
        });
    }

    // Modal confirm - add bank
    if (modalConfirm) {
        modalConfirm.addEventListener('click', addBank);
    }

    // Transfer
    if (transferBtn) {
        transferBtn.addEventListener('click', doTransfer);
    }

    // Airtime
    if (buyAirtimeBtn) {
        buyAirtimeBtn.addEventListener('click', buyAirtime);
    }

    if (serviceType) {
        serviceType.addEventListener('change', configureServiceForm);
        configureServiceForm();
    }

    // Settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    if (privacyToggle) {
        setPrivacyMode(localStorage.getItem('bankease-privacy-mode') === 'hidden');
        privacyToggle.addEventListener('click', () => setPrivacyMode(!document.body.classList.contains('privacy-mode')));
    }

    if (dropTransferButton) {
        dropTransferButton.addEventListener('click', () => {
            if (!pendingTransfer.fromId || !pendingTransfer.toId) return;
            openPage('transfer');
            transferMsg.textContent = `Ready to move money from ${banks.find(bank => bank.id === pendingTransfer.fromId)?.name || 'source'} to ${banks.find(bank => bank.id === pendingTransfer.toId)?.name || 'destination'}.`;
            transferMsg.style.color = '#147d5a';
            dropTransferPrompt.hidden = true;
        });
    }
    if (dropTransferCancel) dropTransferCancel.addEventListener('click', clearDropTransfer);

    if (goalForm) {
        goalForm.addEventListener('submit', event => {
            event.preventDefault();
            const goals = readStoredList(storageKeys.goals);
            goals.push({ id: createLocalId(), name: document.getElementById('goalName').value.trim(), target: Number(document.getElementById('goalTarget').value) });
            writeStoredList(storageKeys.goals, goals);
            goalForm.reset();
            renderFinancialTools();
        });
    }

    if (reminderForm) {
        reminderForm.addEventListener('submit', event => {
            event.preventDefault();
            const reminders = readStoredList(storageKeys.reminders);
            reminders.push({ id: createLocalId(), name: document.getElementById('reminderName').value.trim(), amount: Number(document.getElementById('reminderAmount').value), date: document.getElementById('reminderDate').value });
            writeStoredList(storageKeys.reminders, reminders);
            reminderForm.reset();
            renderFinancialTools();
        });
    }

    document.addEventListener('click', event => {
        const goalButton = event.target.closest('[data-remove-goal]');
        const reminderButton = event.target.closest('[data-remove-reminder]');
        if (goalButton) {
            writeStoredList(storageKeys.goals, readStoredList(storageKeys.goals).filter(goal => goal.id !== goalButton.dataset.removeGoal));
            renderFinancialTools();
        }
        if (reminderButton) {
            writeStoredList(storageKeys.reminders, readStoredList(storageKeys.reminders).filter(reminder => reminder.id !== reminderButton.dataset.removeReminder));
            renderFinancialTools();
        }
    });

    // Page back buttons
    document.querySelectorAll('.page-back').forEach(btn => {
        btn.addEventListener('click', () => {
            openPage('dashboard');
        });
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const page = this.dataset.page;
            if (page === 'dashboard') {
                openPage('dashboard');
            } else if (page === 'transfer') {
                openPage('transfer');
            } else if (page === 'airtime') {
                openPage('airtime');
            } else if (page === 'settings') {
                openPage('settings');
            } else if (page === 'accounts') {
                location.href = 'accounts.html';
            } else if (page === 'analytics') {
                location.href = 'analytics.html';
            }
        });
    });

    // ---------- INIT ----------
    loadUserData().catch(() => { window.location.href = 'login.html'; });
    const requestedPage = new URLSearchParams(window.location.search).get('page');
    openPage(requestedPage === 'transfer' ? 'transfer' : 'dashboard');

})();
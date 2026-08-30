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
    const modalCvv = document.getElementById('modalCvv');
    const modalExpiry = document.getElementById('modalExpiry');
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
    const airtimePhone = document.getElementById('airtimePhone');
    const airtimeAmount = document.getElementById('airtimeAmount');
    const airtimeBank = document.getElementById('airtimeBank');
    const buyAirtimeBtn = document.getElementById('buyAirtimeBtn');
    const airtimeMsg = document.getElementById('airtimeMsg');
    const defaultBankSelect = document.getElementById('defaultBankSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');

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

    // ---------- RENDER BANK LIST ----------
    function renderBankList() {
        bankListEl.innerHTML = banks.map(bank => {
            const style = getBankStyle(bank.name);
            const selected = bank.id === selectedId ? 'active' : '';
            return `<div class="bank-item ${selected}" data-id="${bank.id}">
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
        const accountNum = modalAccount.value.trim() || '0000';
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
        modalCvv.value = '';
        modalExpiry.value = '';
        modalBalance.value = '0';
    }

    // ---------- TRANSFER ----------
    async function doTransfer() {
        const fromId = document.getElementById('transferFrom').value;
        const toId = document.getElementById('transferTo').value;
        const amount = parseFloat(document.getElementById('transferAmount').value);

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
        document.getElementById('transferAmount').value = '';
    }

    // ---------- AIRTIME ----------
    async function buyAirtime() {
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

    // Settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

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
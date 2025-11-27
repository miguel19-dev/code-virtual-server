const express = require('express');
const http = require('http');
const path = require('path');
const app = express();
const server = http.createServer(app);

// Servir archivos estáticos
app.use(express.static('.'));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'turn-test.html'));
});

// Endpoint para obtener información del servidor
app.get('/api/server-info', (req, res) => {
    res.json({
        server: 'Probador TURN',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        clientIP: req.ip || req.connection.remoteAddress,
        headers: req.headers
    });
});

// Endpoint para probar conectividad
app.get('/api/test-connectivity', (req, res) => {
    res.json({
        status: 'success',
        message: 'Servidor funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Endpoint para verificar servidores TURN (simulado)
app.post('/api/verify-turn', express.json(), (req, res) => {
    const { server, url, username, credential } = req.body;
    
    console.log(`Verificando servidor TURN: ${server} (${url})`);
    
    // Simular verificación (en un caso real, aquí harías pruebas reales)
    setTimeout(() => {
        const randomSuccess = Math.random() > 0.3; // 70% de éxito
        const response = {
            server,
            url,
            timestamp: new Date().toISOString(),
            status: randomSuccess ? 'reachable' : 'unreachable',
            details: randomSuccess ? {
                protocol: 'UDP/TCP',
                bandwidth: '1 Gbps',
                latency: Math.floor(Math.random() * 100) + 'ms'
            } : {
                error: 'No se pudo conectar al servidor',
                suggestion: 'Verifica la URL y credenciales'
            }
        };
        
        res.json(response);
    }, 1000);
});

// Servidor de estado simple para WebRTC
app.get('/api/webrtc-status', (req, res) => {
    res.json({
        webrtc: {
            supported: true,
            getUserMedia: true,
            RTCPeerConnection: true,
            RTCDataChannel: true
        },
        environment: {
            node: process.version,
            platform: process.platform,
            uptime: process.uptime()
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de pruebas TURN ejecutándose en http://localhost:${PORT}`);
    console.log(`📊 Accede al probador de TURN en: http://localhost:${PORT}`);
    console.log(`🔧 Puerto: ${PORT}`);
});

// Manejo graceful de cierre
process.on('SIGTERM', () => {
    console.log('Apagando servidor...');
    server.close(() => {
        console.log('Servidor apagado correctamente');
        process.exit(0);
    });
});
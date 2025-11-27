const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));

// Carpetas necesarias
['data', 'uploads/avatars'].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

const USERS_FILE = 'data/users.json';
const MESSAGES_FILE = 'data/messages.json';

// Cargar datos existentes
let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
let messages = fs.existsSync(MESSAGES_FILE) ? JSON.parse(fs.readFileSync(MESSAGES_FILE)) : {};

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// Rutas de autenticación
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

// API de registro
app.post('/api/register', async (req, res) => {
    const { name, password } = req.body;
    
    if (!name || !password || password.length < 6) {
        return res.status(400).json({ error: 'Nombre y contraseña requeridos (mín. 6 caracteres)' });
    }
    
    if (users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const newUser = {
        id: Date.now().toString(),
        name: name.trim(),
        password: await bcrypt.hash(password, 10),
        avatar: '/default-avatar.png',
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsers();
    
    const { password: _, ...safeUser } = newUser;
    res.json({ user: safeUser });
});

// API de login
app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());
    
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
});

// API para obtener usuarios
app.get('/api/users', (req, res) => {
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json(safeUsers);
});

// API para obtener mensajes entre dos usuarios
app.get('/api/messages/:userId1/:userId2', (req, res) => {
    const { userId1, userId2 } = req.params;
    const chatId = [userId1, userId2].sort().join('_');
    
    if (messages[chatId]) {
        res.json(messages[chatId]);
    } else {
        res.json([]);
    }
});

// Socket.IO para mensajería en tiempo real
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // Usuario se conecta
    socket.on('user_online', (user) => {
        onlineUsers.set(socket.id, { ...user, socketId: socket.id });
        io.emit('users_online', Array.from(onlineUsers.values()));
        console.log('Usuario en línea:', user.name);
    });

    // Enviar mensaje privado
    socket.on('private_message', (data) => {
        const { to, message, from } = data;
        const timestamp = new Date().toISOString();
        
        // Guardar mensaje
        const chatId = [from.id, to.id].sort().join('_');
        if (!messages[chatId]) {
            messages[chatId] = [];
        }
        
        const messageData = {
            id: Date.now().toString(),
            from: from.id,
            to: to.id,
            message: message,
            timestamp: timestamp,
            read: false
        };
        
        messages[chatId].push(messageData);
        saveMessages();
        
        // Enviar al destinatario si está en línea
        const recipient = Array.from(onlineUsers.values()).find(u => u.id === to.id);
        if (recipient) {
            io.to(recipient.socketId).emit('new_message', messageData);
        }
        
        // Confirmar al remitente
        socket.emit('message_sent', messageData);
    });

    // Marcar mensajes como leídos
    socket.on('mark_as_read', (data) => {
        const { userId, otherUserId } = data;
        const chatId = [userId, otherUserId].sort().join('_');
        
        if (messages[chatId]) {
            messages[chatId].forEach(msg => {
                if (msg.to === userId && !msg.read) {
                    msg.read = true;
                }
            });
            saveMessages();
        }
    });

    // Usuario desconectado
    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            console.log('Usuario desconectado:', user.name);
            onlineUsers.delete(socket.id);
            io.emit('users_online', Array.from(onlineUsers.values()));
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de mensajería ejecutándose en http://localhost:${PORT}`);
});
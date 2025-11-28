const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Configuración de multer para upload de avatares
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/avatars/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB límite
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
});

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
        bio: "¡Yo uso SecureChat!",
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

// API para obtener chats activos
app.get('/api/chats', (req, res) => {
    const currentUserId = req.query.userId;
    if (!currentUserId) {
        return res.status(400).json({ error: 'Se requiere userId' });
    }

    const userChats = [];
    const safeUsers = users.map(({ password, ...user }) => user);
    
    // Obtener todos los usuarios excepto el actual
    const otherUsers = safeUsers.filter(user => user.id !== currentUserId);
    
    otherUsers.forEach(user => {
        const chatId = [currentUserId, user.id].sort().join('_');
        const chatMessages = messages[chatId] || [];
        
        if (chatMessages.length > 0) {
            const lastMessage = chatMessages[chatMessages.length - 1];
            userChats.push({
                user: user,
                lastMessage: lastMessage.message,
                lastTime: new Date(lastMessage.timestamp).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                unreadCount: chatMessages.filter(msg => 
                    msg.to === currentUserId && !msg.read
                ).length
            });
        }
    });
    
    // Ordenar por último mensaje (más reciente primero)
    userChats.sort((a, b) => {
        const timeA = new Date(messages[[currentUserId, a.user.id].sort().join('_')]?.slice(-1)[0]?.timestamp || 0);
        const timeB = new Date(messages[[currentUserId, b.user.id].sort().join('_')]?.slice(-1)[0]?.timestamp || 0);
        return timeB - timeA;
    });
    
    res.json(userChats);
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

// API para actualizar perfil con avatar
app.put('/api/profile/:userId', upload.single('avatar'), async (req, res) => {
    const { userId } = req.params;
    const { name, bio } = req.body;
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Actualizar datos del usuario
    users[userIndex].name = name;
    users[userIndex].bio = bio;
    
    // Si se subió un nuevo avatar, actualizar la ruta
    if (req.file) {
        // Eliminar avatar anterior si no es el default
        const oldAvatar = users[userIndex].avatar;
        if (oldAvatar && oldAvatar !== '/default-avatar.png' && oldAvatar.startsWith('/uploads/avatars/')) {
            const oldAvatarPath = path.join(__dirname, 'public', oldAvatar);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
            }
        }
        
        users[userIndex].avatar = '/uploads/avatars/' + req.file.filename;
    }
    
    saveUsers();
    
    const { password, ...updatedUser } = users[userIndex];
    
    // Notificar a todos los clientes sobre la actualización
    io.emit('user_updated', updatedUser);
    
    res.json({ user: updatedUser });
});

// Socket.IO para mensajería en tiempo real
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // Usuario se conecta
    socket.on('user_online', (user) => {
        onlineUsers.set(socket.id, { ...user, socketId: socket.id });
        
        // Enviar lista actualizada de usuarios en línea a todos
        io.emit('users_online', Array.from(onlineUsers.values()));
        
        // Enviar al usuario conectado la lista completa de usuarios
        const safeUsers = users.map(({ password, ...user }) => user);
        socket.emit('all_users', safeUsers);
        
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
        const recipientEntry = Array.from(onlineUsers.entries()).find(([_, u]) => u.id === to.id);
        if (recipientEntry) {
            const [recipientSocketId, recipient] = recipientEntry;
            io.to(recipientSocketId).emit('new_message', messageData);
            
            // Enviar notificación de mensaje no leído
            io.to(recipientSocketId).emit('unread_count_update', {
                userId: from.id,
                count: getUnreadCount(recipient.id, from.id)
            });
        }
        
        // Confirmar al remitente
        socket.emit('message_sent', messageData);
        
        // Actualizar contadores para ambos usuarios
        updateUnreadCounts(from.id, to.id);
        
        // Notificar a ambos usuarios para actualizar lista de chats
        socket.emit('chats_updated');
        if (recipientEntry) {
            io.to(recipientEntry[0]).emit('chats_updated');
        }
    });

    // Marcar mensajes como leídos
    socket.on('mark_as_read', (data) => {
        const { userId, otherUserId } = data;
        const chatId = [userId, otherUserId].sort().join('_');
        
        if (messages[chatId]) {
            let updated = false;
            messages[chatId].forEach(msg => {
                if (msg.to === userId && !msg.read) {
                    msg.read = true;
                    updated = true;
                }
            });
            
            if (updated) {
                saveMessages();
                
                // Notificar al remitente que sus mensajes fueron leídos
                const senderEntry = Array.from(onlineUsers.entries()).find(([_, u]) => u.id === otherUserId);
                if (senderEntry) {
                    const [senderSocketId, sender] = senderEntry;
                    io.to(senderSocketId).emit('messages_read', {
                        userId: userId,
                        otherUserId: otherUserId
                    });
                }
                
                // Actualizar contadores
                updateUnreadCounts(userId, otherUserId);
            }
        }
    });

    // Actualización de perfil
    socket.on('profile_update', (userData) => {
        const userIndex = users.findIndex(u => u.id === userData.id);
        if (userIndex !== -1) {
            users[userIndex].name = userData.name;
            users[userIndex].bio = userData.bio;
            saveUsers();
            
            // Notificar a todos los clientes sobre la actualización
            io.emit('user_updated', users[userIndex]);
        }
    });

    // Obtener contadores de mensajes no leídos
    socket.on('get_unread_counts', (userId) => {
        const unreadCounts = {};
        
        users.forEach(user => {
            if (user.id !== userId) {
                unreadCounts[user.id] = getUnreadCount(userId, user.id);
            }
        });
        
        socket.emit('unread_counts', unreadCounts);
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

    // Función para obtener mensajes no leídos
    function getUnreadCount(userId, otherUserId) {
        const chatId = [userId, otherUserId].sort().join('_');
        if (!messages[chatId]) return 0;
        
        return messages[chatId].filter(msg => 
            msg.to === userId && !msg.read
        ).length;
    }

    // Función para actualizar contadores de mensajes no leídos
    function updateUnreadCounts(userId1, userId2) {
        const usersToUpdate = [userId1, userId2];
        
        usersToUpdate.forEach(userId => {
            const userEntry = Array.from(onlineUsers.entries()).find(([_, u]) => u.id === userId);
            if (userEntry) {
                const [socketId, user] = userEntry;
                const unreadCounts = {};
                
                users.forEach(u => {
                    if (u.id !== userId) {
                        unreadCounts[u.id] = getUnreadCount(userId, u.id);
                    }
                });
                
                io.to(socketId).emit('unread_counts', unreadCounts);
            }
        });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de mensajería ejecutándose en http://localhost:${PORT}`);
});
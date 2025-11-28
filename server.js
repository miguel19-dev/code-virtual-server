const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Carpetas necesarias
['data', 'uploads/avatars'].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

const USERS_FILE = 'data/users.json';
const MESSAGES_FILE = 'data/messages.json';
const FOLLOWS_FILE = 'data/follows.json';

// Cargar datos existentes
let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
let messages = fs.existsSync(MESSAGES_FILE) ? JSON.parse(fs.readFileSync(MESSAGES_FILE)) : {};
let follows = fs.existsSync(FOLLOWS_FILE) ? JSON.parse(fs.readFileSync(FOLLOWS_FILE)) : {};

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function saveFollows() {
    fs.writeFileSync(FOLLOWS_FILE, JSON.stringify(follows, null, 2));
}

// Inicializar datos de seguidores si no existen
function initializeFollowData(userId) {
    if (!follows[userId]) {
        follows[userId] = {
            followers: [],
            following: []
        };
        saveFollows();
    }
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

// Middleware para logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Rutas de autenticación
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

// API de registro
app.post('/api/register', async (req, res) => {
    try {
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

        initializeFollowData(newUser.id);

        const { password: _, ...safeUser } = newUser;
        
        io.emit('user_updated', safeUser);
        
        res.json({ user: safeUser });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API de login
app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const { password: _, ...safeUser } = user;
        res.json({ user: safeUser });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener usuarios
app.get('/api/users', (req, res) => {
    try {
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener datos de seguidores
app.get('/api/follows/:userId', (req, res) => {
    try {
        const { userId } = req.params;

        if (!follows[userId]) {
            initializeFollowData(userId);
        }

        const userFollows = follows[userId];

        const followersWithData = userFollows.followers.map(followerId => {
            const user = users.find(u => u.id === followerId);
            return user ? { 
                id: user.id, 
                name: user.name, 
                avatar: user.avatar, 
                bio: user.bio
            } : null;
        }).filter(Boolean);

        const followingWithData = userFollows.following.map(followingId => {
            const user = users.find(u => u.id === followingId);
            return user ? { 
                id: user.id, 
                name: user.name, 
                avatar: user.avatar, 
                bio: user.bio
            } : null;
        }).filter(Boolean);

        res.json({
            followers: followersWithData,
            following: followingWithData,
            followersCount: followersWithData.length,
            followingCount: followingWithData.length
        });
    } catch (error) {
        console.error('Error obteniendo datos de seguidores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para seguir/dejar de seguir
app.post('/api/follow', (req, res) => {
    try {
        const { followerId, followingId } = req.body;

        if (!followerId || !followingId) {
            return res.status(400).json({ error: 'Se requieren followerId y followingId' });
        }

        if (!follows[followerId]) initializeFollowData(followerId);
        if (!follows[followingId]) initializeFollowData(followingId);

        const isFollowing = follows[followerId].following.includes(followingId);

        if (isFollowing) {
            follows[followerId].following = follows[followerId].following.filter(id => id !== followingId);
            follows[followingId].followers = follows[followingId].followers.filter(id => id !== followerId);
        } else {
            follows[followerId].following.push(followingId);
            follows[followingId].followers.push(followerId);
        }

        saveFollows();

        res.json({
            success: true,
            isFollowing: !isFollowing,
            followersCount: follows[followingId].followers.length,
            followingCount: follows[followerId].following.length
        });
    } catch (error) {
        console.error('Error en follow:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener chats activos - SOLO con mensajes
app.get('/api/chats', (req, res) => {
    try {
        const currentUserId = req.query.userId;
        if (!currentUserId) {
            return res.status(400).json({ error: 'Se requiere userId' });
        }

        const userChats = [];
        const safeUsers = users.map(({ password, ...user }) => user);

        const otherUsers = safeUsers.filter(user => user.id !== currentUserId);

        otherUsers.forEach(user => {
            const chatId = [currentUserId, user.id].sort().join('_');
            const chatMessages = messages[chatId] || [];

            // SOLO incluir chats que tienen mensajes
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

        userChats.sort((a, b) => {
            const chatIdA = [currentUserId, a.user.id].sort().join('_');
            const chatIdB = [currentUserId, b.user.id].sort().join('_');
            const timeA = new Date(messages[chatIdA]?.slice(-1)[0]?.timestamp || 0);
            const timeB = new Date(messages[chatIdB]?.slice(-1)[0]?.timestamp || 0);
            return timeB - timeA;
        });

        res.json(userChats);
    } catch (error) {
        console.error('Error obteniendo chats:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener mensajes entre dos usuarios
app.get('/api/messages/:userId1/:userId2', (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        const chatId = [userId1, userId2].sort().join('_');

        if (messages[chatId]) {
            res.json(messages[chatId]);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para actualizar perfil con avatar
app.put('/api/profile/:userId', upload.single('avatar'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, bio, password } = req.body;

        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        users[userIndex].name = name || users[userIndex].name;
        users[userIndex].bio = bio || users[userIndex].bio;

        if (password && password.length >= 6) {
            users[userIndex].password = await bcrypt.hash(password, 10);
        }

        if (req.file) {
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

        const { password: _, ...updatedUser } = users[userIndex];

        io.emit('user_updated', updatedUser);

        res.json({ user: updatedUser });
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para eliminar cuenta
app.delete('/api/profile/:userId', (req, res) => {
    try {
        const { userId } = req.params;

        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const deletedUser = users[userIndex];

        users.splice(userIndex, 1);
        saveUsers();

        if (follows[userId]) {
            delete follows[userId];
            saveFollows();
        }

        Object.keys(messages).forEach(chatId => {
            if (chatId.includes(userId)) {
                delete messages[chatId];
            }
        });
        saveMessages();

        io.emit('user_deleted', { id: userId });

        res.json({ success: true, message: 'Cuenta eliminada correctamente' });
    } catch (error) {
        console.error('Error eliminando cuenta:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Socket.IO para mensajería en tiempo real
const onlineUsers = new Map();

function getUserSocket(userId) {
    const entry = Array.from(onlineUsers.entries()).find(([_, u]) => u.id === userId);
    return entry ? entry[0] : null;
}

function getUnreadCount(userId, otherUserId) {
    const chatId = [userId, otherUserId].sort().join('_');
    if (!messages[chatId]) return 0;

    return messages[chatId].filter(msg => 
        msg.to === userId && !msg.read
    ).length;
}

function updateUnreadCounts(userId1, userId2) {
    const usersToUpdate = [userId1, userId2];

    usersToUpdate.forEach(userId => {
        const userSocket = getUserSocket(userId);
        if (userSocket) {
            const unreadCounts = {};
            users.forEach(u => {
                if (u.id !== userId) {
                    unreadCounts[u.id] = getUnreadCount(userId, u.id);
                }
            });
            io.to(userSocket).emit('unread_counts', unreadCounts);
        }
    });
}

function notifyChatsUpdated(userIds) {
    userIds.forEach(userId => {
        const userSocket = getUserSocket(userId);
        if (userSocket) {
            io.to(userSocket).emit('chats_updated');
        }
    });
}

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('user_online', (user) => {
        onlineUsers.set(socket.id, { ...user, socketId: socket.id, lastSeen: null });

        const onlineUsersList = Array.from(onlineUsers.values()).map(({ socketId, ...user }) => user);
        io.emit('users_online', onlineUsersList);

        const safeUsers = users.map(({ password, ...user }) => user);
        socket.emit('all_users', safeUsers);

        if (!follows[user.id]) {
            initializeFollowData(user.id);
        }
        
        const userFollows = follows[user.id];
        const followersWithData = userFollows.followers.map(followerId => {
            const userData = users.find(u => u.id === followerId);
            return userData ? { 
                id: userData.id, 
                name: userData.name, 
                avatar: userData.avatar, 
                bio: userData.bio
            } : null;
        }).filter(Boolean);

        const followingWithData = userFollows.following.map(followingId => {
            const userData = users.find(u => u.id === followingId);
            return userData ? { 
                id: userData.id, 
                name: userData.name, 
                avatar: userData.avatar, 
                bio: userData.bio
            } : null;
        }).filter(Boolean);

        socket.emit('follow_data', {
            followers: followersWithData,
            following: followingWithData,
            followersCount: followersWithData.length,
            followingCount: followingWithData.length
        });

        console.log('Usuario en línea:', user.name);
    });

    socket.on('private_message', (data) => {
        try {
            const { to, message, from } = data;
            const timestamp = new Date().toISOString();

            if (!to || !message || !from) {
                socket.emit('message_error', { error: 'Datos de mensaje incompletos' });
                return;
            }

            const chatId = [from.id, to.id].sort().join('_');
            if (!messages[chatId]) {
                messages[chatId] = [];
            }

            const messageData = {
                id: Date.now().toString(),
                from: from.id,
                to: to.id,
                message: message.trim(),
                timestamp: timestamp,
                read: false
            };

            messages[chatId].push(messageData);
            saveMessages();

            const recipientSocket = getUserSocket(to.id);
            if (recipientSocket) {
                io.to(recipientSocket).emit('new_message', messageData);
            }

            socket.emit('message_sent', messageData);

            updateUnreadCounts(from.id, to.id);

            notifyChatsUpdated([from.id, to.id]);

            console.log(`Mensaje de ${from.name} para ${to.name}: ${message.substring(0, 50)}...`);
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            socket.emit('message_error', { error: 'Error enviando mensaje' });
        }
    });

    socket.on('mark_as_read', (data) => {
        try {
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
                    updateUnreadCounts(userId, otherUserId);
                    notifyChatsUpdated([userId, otherUserId]);
                }
            }
        } catch (error) {
            console.error('Error marcando mensajes como leídos:', error);
        }
    });

    socket.on('toggle_follow', (data) => {
        try {
            const { followerId, followingId } = data;

            if (!followerId || !followingId) {
                socket.emit('follow_error', { error: 'Datos incompletos' });
                return;
            }

            if (!follows[followerId]) initializeFollowData(followerId);
            if (!follows[followingId]) initializeFollowData(followingId);

            const isFollowing = follows[followerId].following.includes(followingId);

            if (isFollowing) {
                follows[followerId].following = follows[followerId].following.filter(id => id !== followingId);
                follows[followingId].followers = follows[followingId].followers.filter(id => id !== followerId);
            } else {
                follows[followerId].following.push(followingId);
                follows[followingId].followers.push(followerId);
            }

            saveFollows();

            const followerData = users.find(u => u.id === followerId);
            const followingData = users.find(u => u.id === followingId);

            if (followerData && followingData) {
                const { password: _, ...safeFollower } = followerData;
                const { password: __, ...safeFollowing } = followingData;

                const followerSocket = getUserSocket(followerId);
                if (followerSocket) {
                    io.to(followerSocket).emit('follow_updated', {
                        followingId: followingId,
                        isFollowing: !isFollowing,
                        followingCount: follows[followerId].following.length,
                        user: safeFollowing
                    });
                }

                const followingSocket = getUserSocket(followingId);
                if (followingSocket) {
                    io.to(followingSocket).emit('follower_updated', {
                        followerId: followerId,
                        followersCount: follows[followingId].followers.length,
                        user: safeFollower
                    });
                }

                if (followerSocket) {
                    const followerFollows = follows[followerId];
                    const followingWithData = followerFollows.following.map(fId => {
                        const user = users.find(u => u.id === fId);
                        return user ? { 
                            id: user.id, 
                            name: user.name, 
                            avatar: user.avatar, 
                            bio: user.bio
                        } : null;
                    }).filter(Boolean);
                    
                    io.to(followerSocket).emit('follow_data', {
                        followers: followerFollows.followers.map(fId => {
                            const user = users.find(u => u.id === fId);
                            return user ? { 
                                id: user.id, 
                                name: user.name, 
                                avatar: user.avatar, 
                                bio: user.bio
                            } : null;
                        }).filter(Boolean),
                        following: followingWithData,
                        followersCount: followerFollows.followers.length,
                        followingCount: followingWithData.length
                    });
                }
            }
        } catch (error) {
            console.error('Error en toggle_follow:', error);
            socket.emit('follow_error', { error: 'Error interno del servidor' });
        }
    });

    socket.on('user_typing', (data) => {
        try {
            const { to, from } = data;
            const recipientSocket = getUserSocket(to.id);
            if (recipientSocket) {
                io.to(recipientSocket).emit('user_typing', { from: from.id });
            }
        } catch (error) {
            console.error('Error en user_typing:', error);
        }
    });

    socket.on('user_stop_typing', (data) => {
        try {
            const { to, from } = data;
            const recipientSocket = getUserSocket(to.id);
            if (recipientSocket) {
                io.to(recipientSocket).emit('user_stop_typing', { from: from.id });
            }
        } catch (error) {
            console.error('Error en user_stop_typing:', error);
        }
    });

    socket.on('get_unread_counts', (userId) => {
        try {
            const unreadCounts = {};
            users.forEach(user => {
                if (user.id !== userId) {
                    unreadCounts[user.id] = getUnreadCount(userId, user.id);
                }
            });
            socket.emit('unread_counts', unreadCounts);
        } catch (error) {
            console.error('Error obteniendo contadores no leídos:', error);
        }
    });

    socket.on('get_follow_data', (userId) => {
        try {
            if (!follows[userId]) {
                initializeFollowData(userId);
            }

            const userFollows = follows[userId];

            const followersWithData = userFollows.followers.map(followerId => {
                const user = users.find(u => u.id === followerId);
                return user ? { 
                    id: user.id, 
                    name: user.name, 
                    avatar: user.avatar, 
                    bio: user.bio
                } : null;
            }).filter(Boolean);

            const followingWithData = userFollows.following.map(followingId => {
                const user = users.find(u => u.id === followingId);
                return user ? { 
                    id: user.id, 
                    name: user.name, 
                    avatar: user.avatar, 
                    bio: user.bio
                } : null;
            }).filter(Boolean);

            socket.emit('follow_data', {
                followers: followersWithData,
                following: followingWithData,
                followersCount: followersWithData.length,
                followingCount: followingWithData.length
            });
        } catch (error) {
            console.error('Error obteniendo datos de seguidores:', error);
        }
    });

    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            console.log('Usuario desconectado:', user.name);

            io.emit('user_offline', {
                id: user.id,
                lastSeen: new Date().toISOString()
            });

            onlineUsers.delete(socket.id);
            
            const onlineUsersList = Array.from(onlineUsers.values()).map(({ socketId, ...user }) => user);
            io.emit('users_online', onlineUsersList);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de mensajería ejecutándose en http://localhost:${PORT}`);
    console.log(`✅ Socket.IO configurado para tiempo real sin retrasos`);
});
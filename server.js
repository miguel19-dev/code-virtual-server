const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

// Configuración de PostgreSQL
const pool = new Pool({
    user: 'securechat_im03_user',
    host: 'dpg-d4l5530gjchc73ah6j10-a.oregon-postgres.render.com',
    database: 'securechat_im03',
    password: 'kruf294SvJ8Ta7BJb5hlpfihQEnWJ3F9',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// Verificar conexión a la base de datos
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error conectando a PostgreSQL:', err);
    } else {
        console.log('✅ Conectado a PostgreSQL');
        release();
        initializeDatabase();
    }
});

// Inicializar tablas de la base de datos
async function initializeDatabase() {
    try {
        // Tabla de usuarios
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                avatar VARCHAR(500) DEFAULT '/default-avatar.png',
                bio TEXT DEFAULT '¡Yo uso SecureChat!',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de seguidores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS follows (
                id SERIAL PRIMARY KEY,
                follower_id VARCHAR(50) NOT NULL,
                following_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(follower_id, following_id)
            )
        `);

        console.log('✅ Tablas de la base de datos inicializadas');
    } catch (error) {
        console.error('Error inicializando base de datos:', error);
    }
}

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Carpetas necesarias para archivos
['uploads/avatars', 'data'].forEach(d => {
    if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
    }
});

const MESSAGES_FILE = 'data/messages.json';
let messages = fs.existsSync(MESSAGES_FILE) ? JSON.parse(fs.readFileSync(MESSAGES_FILE)) : {};

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

        // Verificar si el usuario ya existe
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE name = $1',
            [name.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        const userId = Date.now().toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar nuevo usuario
        const newUser = await pool.query(
            `INSERT INTO users (user_id, name, password, avatar, bio) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING user_id, name, avatar, bio, created_at`,
            [userId, name.trim(), hashedPassword, '/default-avatar.png', "¡Yo uso SecureChat!"]
        );

        const safeUser = newUser.rows[0];

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
        
        const userResult = await pool.query(
            'SELECT * FROM users WHERE name = $1',
            [name.toLowerCase()]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const user = userResult.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
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
app.get('/api/users', async (req, res) => {
    try {
        const usersResult = await pool.query(
            'SELECT user_id, name, avatar, bio, created_at FROM users'
        );
        
        res.json(usersResult.rows);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para obtener datos de seguidores
app.get('/api/follows/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Obtener seguidores
        const followersResult = await pool.query(`
            SELECT u.user_id, u.name, u.avatar, u.bio 
            FROM follows f 
            JOIN users u ON f.follower_id = u.user_id 
            WHERE f.following_id = $1
        `, [userId]);

        // Obtener seguidos
        const followingResult = await pool.query(`
            SELECT u.user_id, u.name, u.avatar, u.bio 
            FROM follows f 
            JOIN users u ON f.following_id = u.user_id 
            WHERE f.follower_id = $1
        `, [userId]);

        res.json({
            followers: followersResult.rows,
            following: followingResult.rows,
            followersCount: followersResult.rows.length,
            followingCount: followingResult.rows.length
        });
    } catch (error) {
        console.error('Error obteniendo datos de seguidores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para seguir/dejar de seguir
app.post('/api/follow', async (req, res) => {
    try {
        const { followerId, followingId } = req.body;

        if (!followerId || !followingId) {
            return res.status(400).json({ error: 'Se requieren followerId y followingId' });
        }

        // Verificar si ya está siguiendo
        const existingFollow = await pool.query(
            'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
            [followerId, followingId]
        );

        if (existingFollow.rows.length > 0) {
            // Dejar de seguir
            await pool.query(
                'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
                [followerId, followingId]
            );
            
            res.json({
                success: true,
                isFollowing: false,
                followersCount: await getFollowersCount(followingId),
                followingCount: await getFollowingCount(followerId)
            });
        } else {
            // Seguir
            await pool.query(
                'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
                [followerId, followingId]
            );
            
            res.json({
                success: true,
                isFollowing: true,
                followersCount: await getFollowersCount(followingId),
                followingCount: await getFollowingCount(followerId)
            });
        }
    } catch (error) {
        console.error('Error en follow:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Funciones auxiliares para contar seguidores/seguidos
async function getFollowersCount(userId) {
    const result = await pool.query(
        'SELECT COUNT(*) FROM follows WHERE following_id = $1',
        [userId]
    );
    return parseInt(result.rows[0].count);
}

async function getFollowingCount(userId) {
    const result = await pool.query(
        'SELECT COUNT(*) FROM follows WHERE follower_id = $1',
        [userId]
    );
    return parseInt(result.rows[0].count);
}

// API para obtener chats activos - SOLO con mensajes
app.get('/api/chats', async (req, res) => {
    try {
        const currentUserId = req.query.userId;
        if (!currentUserId) {
            return res.status(400).json({ error: 'Se requiere userId' });
        }

        const userChats = [];
        
        // Obtener todos los usuarios excepto el actual
        const usersResult = await pool.query(
            'SELECT user_id, name, avatar, bio FROM users WHERE user_id != $1',
            [currentUserId]
        );

        const otherUsers = usersResult.rows;

        for (const user of otherUsers) {
            const chatId = [currentUserId, user.user_id].sort().join('_');
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
        }

        userChats.sort((a, b) => {
            const chatIdA = [currentUserId, a.user.user_id].sort().join('_');
            const chatIdB = [currentUserId, b.user.user_id].sort().join('_');
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

        // Obtener usuario actual para preservar datos existentes
        const userResult = await pool.query(
            'SELECT * FROM users WHERE user_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const currentUser = userResult.rows[0];
        let updateFields = [];
        let updateValues = [];
        let paramCount = 1;

        // Construir consulta dinámica
        if (name) {
            updateFields.push(`name = $${paramCount}`);
            updateValues.push(name);
            paramCount++;
        }

        if (bio) {
            updateFields.push(`bio = $${paramCount}`);
            updateValues.push(bio);
            paramCount++;
        }

        if (password && password.length >= 6) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.push(`password = $${paramCount}`);
            updateValues.push(hashedPassword);
            paramCount++;
        }

        if (req.file) {
            // Eliminar avatar anterior si no es el default
            if (currentUser.avatar && currentUser.avatar !== '/default-avatar.png' && currentUser.avatar.startsWith('/uploads/avatars/')) {
                const oldAvatarPath = path.join(__dirname, 'public', currentUser.avatar);
                if (fs.existsSync(oldAvatarPath)) {
                    fs.unlinkSync(oldAvatarPath);
                }
            }

            const newAvatarPath = '/uploads/avatars/' + req.file.filename;
            updateFields.push(`avatar = $${paramCount}`);
            updateValues.push(newAvatarPath);
            paramCount++;
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        updateValues.push(userId);
        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')} 
            WHERE user_id = $${paramCount} 
            RETURNING user_id, name, avatar, bio, created_at
        `;

        const updatedUser = await pool.query(updateQuery, updateValues);

        io.emit('user_updated', updatedUser.rows[0]);

        res.json({ user: updatedUser.rows[0] });
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API para eliminar cuenta
app.delete('/api/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Obtener usuario antes de eliminar
        const userResult = await pool.query(
            'SELECT * FROM users WHERE user_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const deletedUser = userResult.rows[0];

        // Eliminar avatar si no es el default
        if (deletedUser.avatar && deletedUser.avatar !== '/default-avatar.png' && deletedUser.avatar.startsWith('/uploads/avatars/')) {
            const avatarPath = path.join(__dirname, 'public', deletedUser.avatar);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
            }
        }

        // Eliminar usuario de la base de datos
        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        
        // Eliminar relaciones de seguidores
        await pool.query('DELETE FROM follows WHERE follower_id = $1 OR following_id = $1', [userId]);

        // Eliminar mensajes del archivo
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
            // Obtener todos los usuarios para calcular contadores
            pool.query('SELECT user_id FROM users WHERE user_id != $1', [userId])
                .then(result => {
                    result.rows.forEach(user => {
                        unreadCounts[user.user_id] = getUnreadCount(userId, user.user_id);
                    });
                    io.to(userSocket).emit('unread_counts', unreadCounts);
                })
                .catch(error => {
                    console.error('Error obteniendo usuarios para unread counts:', error);
                });
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

    socket.on('user_online', async (user) => {
        onlineUsers.set(socket.id, { ...user, socketId: socket.id, lastSeen: null });

        const onlineUsersList = Array.from(onlineUsers.values()).map(({ socketId, ...user }) => user);
        io.emit('users_online', onlineUsersList);

        // Enviar todos los usuarios
        try {
            const usersResult = await pool.query(
                'SELECT user_id, name, avatar, bio FROM users'
            );
            socket.emit('all_users', usersResult.rows);
        } catch (error) {
            console.error('Error obteniendo usuarios para socket:', error);
        }

        // Enviar datos de seguidores
        try {
            const followersResult = await pool.query(`
                SELECT u.user_id, u.name, u.avatar, u.bio 
                FROM follows f 
                JOIN users u ON f.follower_id = u.user_id 
                WHERE f.following_id = $1
            `, [user.id]);

            const followingResult = await pool.query(`
                SELECT u.user_id, u.name, u.avatar, u.bio 
                FROM follows f 
                JOIN users u ON f.following_id = u.user_id 
                WHERE f.follower_id = $1
            `, [user.id]);

            socket.emit('follow_data', {
                followers: followersResult.rows,
                following: followingResult.rows,
                followersCount: followersResult.rows.length,
                followingCount: followingResult.rows.length
            });
        } catch (error) {
            console.error('Error obteniendo datos de seguidores para socket:', error);
        }

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

    socket.on('toggle_follow', async (data) => {
        try {
            const { followerId, followingId } = data;

            if (!followerId || !followingId) {
                socket.emit('follow_error', { error: 'Datos incompletos' });
                return;
            }

            // Verificar si ya está siguiendo
            const existingFollow = await pool.query(
                'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
                [followerId, followingId]
            );

            let isFollowing = existingFollow.rows.length > 0;

            if (isFollowing) {
                // Dejar de seguir
                await pool.query(
                    'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
                    [followerId, followingId]
                );
                isFollowing = false;
            } else {
                // Seguir
                await pool.query(
                    'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
                    [followerId, followingId]
                );
                isFollowing = true;
            }

            // Obtener datos actualizados de usuarios
            const followerResult = await pool.query(
                'SELECT user_id, name, avatar, bio FROM users WHERE user_id = $1',
                [followerId]
            );

            const followingResult = await pool.query(
                'SELECT user_id, name, avatar, bio FROM users WHERE user_id = $1',
                [followingId]
            );

            if (followerResult.rows.length > 0 && followingResult.rows.length > 0) {
                const followerData = followerResult.rows[0];
                const followingData = followingResult.rows[0];

                const followerSocket = getUserSocket(followerId);
                if (followerSocket) {
                    io.to(followerSocket).emit('follow_updated', {
                        followingId: followingId,
                        isFollowing: isFollowing,
                        followingCount: await getFollowingCount(followerId),
                        user: followingData
                    });
                }

                const followingSocket = getUserSocket(followingId);
                if (followingSocket) {
                    io.to(followingSocket).emit('follower_updated', {
                        followerId: followerId,
                        followersCount: await getFollowersCount(followingId),
                        user: followerData
                    });
                }

                // Enviar datos completos de seguidores al follower
                if (followerSocket) {
                    const followersResult = await pool.query(`
                        SELECT u.user_id, u.name, u.avatar, u.bio 
                        FROM follows f 
                        JOIN users u ON f.follower_id = u.user_id 
                        WHERE f.following_id = $1
                    `, [followerId]);

                    const followingResult = await pool.query(`
                        SELECT u.user_id, u.name, u.avatar, u.bio 
                        FROM follows f 
                        JOIN users u ON f.following_id = u.user_id 
                        WHERE f.follower_id = $1
                    `, [followerId]);

                    io.to(followerSocket).emit('follow_data', {
                        followers: followersResult.rows,
                        following: followingResult.rows,
                        followersCount: followersResult.rows.length,
                        followingCount: followingResult.rows.length
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
            pool.query('SELECT user_id FROM users WHERE user_id != $1', [userId])
                .then(result => {
                    result.rows.forEach(user => {
                        unreadCounts[user.user_id] = getUnreadCount(userId, user.user_id);
                    });
                    socket.emit('unread_counts', unreadCounts);
                })
                .catch(error => {
                    console.error('Error obteniendo usuarios para unread counts:', error);
                });
        } catch (error) {
            console.error('Error obteniendo contadores no leídos:', error);
        }
    });

    socket.on('get_follow_data', async (userId) => {
        try {
            const followersResult = await pool.query(`
                SELECT u.user_id, u.name, u.avatar, u.bio 
                FROM follows f 
                JOIN users u ON f.follower_id = u.user_id 
                WHERE f.following_id = $1
            `, [userId]);

            const followingResult = await pool.query(`
                SELECT u.user_id, u.name, u.avatar, u.bio 
                FROM follows f 
                JOIN users u ON f.following_id = u.user_id 
                WHERE f.follower_id = $1
            `, [userId]);

            socket.emit('follow_data', {
                followers: followersResult.rows,
                following: followingResult.rows,
                followersCount: followersResult.rows.length,
                followingCount: followingResult.rows.length
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
    console.log(`✅ PostgreSQL configurado correctamente`);
    console.log(`✅ Socket.IO configurado para tiempo real`);
});
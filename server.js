const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configuración de multer para avatares
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Archivos de datos
const USERS_FILE = 'data/users.json';
const CALLS_FILE = 'data/calls.json';

// Crear directorios necesarios
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars', { recursive: true });

// Funciones para manejar archivos JSON
function readJSONFile(filename) {
  try {
    if (!fs.existsSync(filename)) return [];
    const data = fs.readFileSync(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return [];
  }
}

function writeJSONFile(filename, data) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    return false;
  }
}

// Datos en memoria
let users = readJSONFile(USERS_FILE);
let callHistory = readJSONFile(CALLS_FILE);
let activeCalls = [];
let onlineUsers = [];

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'web.html'));
});

// API Routes
app.get('/api/users', (req, res) => {
  const safeUsers = users.map(user => ({
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    online: user.online
  }));
  res.json(safeUsers);
});

app.get('/api/call-history', (req, res) => {
  try {
    // Incluir información completa de los usuarios en el historial
    const completeHistory = callHistory.map(call => {
      const fromUser = users.find(u => u.id === call.from.id) || call.from;
      const toUser = users.find(u => u.id === call.to.id) || call.to;
      
      return {
        ...call,
        from: {
          id: fromUser.id,
          name: fromUser.name,
          avatar: fromUser.avatar
        },
        to: {
          id: toUser.id,
          name: toUser.name,
          avatar: toUser.avatar
        }
      };
    });
    
    const sortedHistory = completeHistory.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    res.json(sortedHistory.slice(0, 50));
  } catch (error) {
    console.error('Error getting call history:', error);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

// Registro de usuario
app.post('/api/register', upload.single('avatar'), async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Nombre y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existingUser = users.find(user => user.name === name);
    if (existingUser) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }

    const newUser = {
      id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
      name: name.trim(),
      password: await bcrypt.hash(password, 10),
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '/default-avatar.png',
      online: false,
      socketId: null,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJSONFile(USERS_FILE, users);

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ 
      message: 'Usuario registrado exitosamente',
      user: userWithoutPassword 
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Login de usuario
app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Nombre y contraseña son requeridos' });
    }

    const user = users.find(u => u.name === name);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    user.online = true;
    writeJSONFile(USERS_FILE, users);

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Login exitoso',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// WebRTC Signaling
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Login via socket
  socket.on('user-login', (userData) => {
    const user = users.find(u => u.id === userData.id);
    if (user) {
      user.online = true;
      user.socketId = socket.id;

      // Actualizar o agregar usuario online
      const existingOnlineUser = onlineUsers.find(u => u.id === user.id);
      if (existingOnlineUser) {
        existingOnlineUser.socketId = socket.id;
      } else {
        onlineUsers.push({
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          socketId: socket.id
        });
      }

      writeJSONFile(USERS_FILE, users);
      io.emit('users-updated', onlineUsers);
      console.log(`Usuario ${user.name} conectado`);
    }
  });

  // Iniciar llamada
  socket.on('initiate-call', (data) => {
    const { fromUser, toUserId, callType } = data;
    const toUser = onlineUsers.find(u => u.id == toUserId);

    if (toUser && toUser.socketId) {
      const callData = {
        id: Date.now(),
        from: {
          ...fromUser,
          socketId: socket.id
        },
        to: {
          id: toUser.id,
          name: toUser.name,
          avatar: toUser.avatar,
          socketId: toUser.socketId
        },
        type: callType,
        status: 'calling',
        startTime: new Date().toISOString(),
        endTime: null,
        duration: 0
      };

      activeCalls.push(callData);

      // Notificar al usuario destinatario
      io.to(toUser.socketId).emit('incoming-call', {
        callId: callData.id,
        fromUser: fromUser,
        callType: callType
      });

      // Notificar al que inicia la llamada con info del destino
      io.to(socket.id).emit('call-initiated', {
        callId: callData.id,
        toUser: toUser
      });

      console.log(`Llamada iniciada de ${fromUser.name} a ${toUser.name}`);
    } else {
      socket.emit('call-error', { message: 'Usuario no disponible' });
    }
  });

  // WebRTC Signaling - Oferta
  socket.on('webrtc-offer', (data) => {
    const { to, offer, callId } = data;
    console.log('📞 Oferta WebRTC enviada a:', to);
    
    const toUser = onlineUsers.find(u => u.socketId === to);
    if (toUser) {
      io.to(toUser.socketId).emit('webrtc-offer', {
        from: socket.id,
        offer: offer,
        callId: callId
      });
    }
  });

  // WebRTC Signaling - Respuesta
  socket.on('webrtc-answer', (data) => {
    const { to, answer, callId } = data;
    console.log('📞 Respuesta WebRTC enviada a:', to);
    
    const toUser = onlineUsers.find(u => u.socketId === to);
    if (toUser) {
      io.to(toUser.socketId).emit('webrtc-answer', {
        from: socket.id,
        answer: answer,
        callId: callId
      });
    }
  });

  // WebRTC Signaling - Candidatos ICE
  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate, callId } = data;
    const toUser = onlineUsers.find(u => u.socketId === to);
    if (toUser) {
      io.to(toUser.socketId).emit('webrtc-ice-candidate', {
        from: socket.id,
        candidate: candidate,
        callId: callId
      });
    }
  });

  // Contestar llamada
  socket.on('answer-call', (data) => {
    const { callId } = data;
    const call = activeCalls.find(c => c.id === callId);

    if (call) {
      call.status = 'connected';

      // Notificar a AMBOS usuarios
      if (call.from.socketId) {
        io.to(call.from.socketId).emit('call-connected', { 
          callId: callId,
          connectedUser: call.to
        });
      }
      if (call.to.socketId) {
        io.to(call.to.socketId).emit('call-connected', { 
          callId: callId,
          connectedUser: call.from
        });
      }

      console.log(`Llamada ${callId} contestada - Ambos usuarios notificados`);
    }
  });

  // Rechazar llamada
  socket.on('reject-call', (data) => {
    const { callId } = data;
    const call = activeCalls.find(c => c.id === callId);

    if (call) {
      call.status = 'rejected';
      call.endTime = new Date().toISOString();

      // Notificar al usuario que inició la llamada
      if (call.from.socketId) {
        io.to(call.from.socketId).emit('call-rejected', { 
          callId,
          userName: call.to.name
        });
      }

      // Guardar en historial
      const callRecord = {
        ...call,
        duration: 0
      };
      callHistory.unshift(callRecord);
      writeJSONFile(CALLS_FILE, callHistory);

      // Remover llamada activa
      activeCalls = activeCalls.filter(c => c.id !== callId);
      console.log(`Llamada ${callId} rechazada`);
    }
  });

  // Terminar llamada
  socket.on('end-call', (data) => {
    const { callId } = data;
    const call = activeCalls.find(c => c.id === callId);

    if (call) {
      const endTime = new Date();
      const startTime = new Date(call.startTime);
      const duration = Math.floor((endTime - startTime) / 1000);

      call.status = 'completed';
      call.endTime = endTime.toISOString();
      call.duration = duration;

      // Notificar a AMBOS usuarios si están conectados
      if (call.from.socketId) {
        io.to(call.from.socketId).emit('call-ended', { 
          callId, 
          duration
        });
      }
      
      if (call.to.socketId && call.to.socketId !== socket.id) {
        io.to(call.to.socketId).emit('call-ended', { 
          callId, 
          duration
        });
      }

      // Guardar en historial
      const callRecord = { ...call };
      callHistory.unshift(callRecord);
      writeJSONFile(CALLS_FILE, callHistory);

      // Remover llamada activa
      activeCalls = activeCalls.filter(c => c.id !== callId);
      console.log(`Llamada ${callId} finalizada por ${socket.id}, duración: ${duration}s`);
    }
  });

  // Toggle audio
  socket.on('toggle-audio', (data) => {
    const { callId, muted } = data;
    const call = activeCalls.find(c => c.id === callId);

    if (call) {
      // Notificar al otro usuario
      const targetSocketId = call.from.socketId === socket.id ? 
                           call.to.socketId : call.from.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit('audio-toggled', { muted });
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);

    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.online = false;
      user.socketId = null;
      writeJSONFile(USERS_FILE, users);
    }

    // Remover usuario de onlineUsers
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);

    // Terminar llamadas activas del usuario
    const userCalls = activeCalls.filter(c => 
      c.from.socketId === socket.id || c.to.socketId === socket.id
    );

    userCalls.forEach(call => {
      const endTime = new Date();
      const startTime = new Date(call.startTime);
      const duration = Math.floor((endTime - startTime) / 1000);

      const otherSocketId = call.from.socketId === socket.id ? 
        call.to.socketId : call.from.socketId;

      if (otherSocketId) {
        io.to(otherSocketId).emit('call-ended', { 
          callId: call.id, 
          duration: duration 
        });
      }

      if (call.startTime) {
        const callRecord = {
          ...call,
          status: 'completed',
          endTime: endTime.toISOString(),
          duration: duration
        };
        callHistory.unshift(callRecord);
        writeJSONFile(CALLS_FILE, callHistory);
      }
    });

    activeCalls = activeCalls.filter(c => 
      c.from.socketId !== socket.id && c.to.socketId !== socket.id
    );

    io.emit('users-updated', onlineUsers);
    console.log(`Usuario ${user?.name} desconectado`);
  });
});

// Manejo de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo es demasiado grande' });
    }
  }
  console.error('Error del servidor:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`📞 Sistema de llamadas WebRTC activo`);
  console.log(`🔐 Autenticación y registro funcionando`);
  console.log(`📱 App disponible en http://localhost:${PORT}`);
});
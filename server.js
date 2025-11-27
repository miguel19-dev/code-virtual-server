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
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer para avatares
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo imágenes'));
  }
});

// Archivos JSON
const USERS_FILE = 'data/users.json';
const CALLS_FILE = 'data/calls.json';
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars', { recursive: true });

// Helpers JSON
function readJSON(file) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  } catch { return []; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; } catch { return false; }
}

let users = readJSON(USERS_FILE);
let callHistory = readJSON(CALLS_FILE);
let activeCalls = [];
let onlineUsers = [];

// Rutas estáticas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

// API
app.get('/api/call-history', (req, res) => {
  const enriched = callHistory.map(call => ({
    ...call,
    from: users.find(u => u.id === call.from.id) || call.from,
    to: users.find(u => u.id === call.to.id) || call.to
  }));
  res.json(enriched.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 50));
});

app.post('/api/register', upload.single('avatar'), async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password || password.length < 6) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    if (users.find(u => u.name === name)) {
      return res.status(400).json({ error: 'Usuario ya existe' });
    }
    const newUser = {
      id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
      name: name.trim(),
      password: await bcrypt.hash(password, 10),
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '/default-avatar.png',
      online: false,
      socketId: null,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    const { password: _, ...safe } = newUser;
    res.status(201).json({ message: 'Registrado', user: safe });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = users.find(u => u.name === name);
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    user.online = true;
    writeJSON(USERS_FILE, users);
    const { password: _, ...safe } = user;
    res.json({ message: 'Login OK', user: safe });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.on('user-login', (userData) => {
    const user = users.find(u => u.id === userData.id);
    if (user) {
      user.online = true;
      user.socketId = socket.id;

      const onlineEntry = {
        id: user.id,
        name: user.name,
        avatar: user.avatar || '/default-avatar.png',
        socketId: socket.id
      };

      const existing = onlineUsers.find(u => u.id === user.id);
      if (existing) Object.assign(existing, onlineEntry);
      else onlineUsers.push(onlineEntry);

      writeJSON(USERS_FILE, users);
      io.emit('users-updated', onlineUsers);
    }
  });

  socket.on('initiate-call', ({ fromUser, toUserId, callType = 'audio' }) => {
    const toUser = onlineUsers.find(u => u.id == toUserId);
    if (!toUser) return socket.emit('call-error', { message: 'Usuario no conectado' });

    const callData = {
      id: Date.now(),
      from: { ...fromUser, socketId: socket.id },
      to: { id: toUser.id, name: toUser.name, avatar: toUser.avatar, socketId: toUser.socketId },
      type: callType,
      status: 'ringing',
      startTime: new Date().toISOString()
    };

    activeCalls.push(callData);

    // Avisar al que recibe
    io.to(toUser.socketId).emit('incoming-call', {
      callId: callData.id,
      fromUser: fromUser,
      callType
    });

    // Confirmar al que llama
    socket.emit('call-initiated', {
      callId: callData.id,
      to: { id: toUser.id, name: toUser.name, avatar: toUser.avatar, socketId: toUser.socketId }
    });
  });

  socket.on('webrtc-offer', data => io.to(data.to).emit('webrtc-offer', { ...data, from: socket.id }));
  socket.on('webrtc-answer', data => io.to(data.to).emit('webrtc-answer', { ...data, from: socket.id }));
  socket.on('webrtc-ice-candidate', data => io.to(data.to).emit('webrtc-ice-candidate', { ...data, from: socket.id }));

  socket.on('answer-call', ({ callId }) => {
    const call = activeCalls.find(c => c.id === callId);
    if (call) {
      call.status = 'connected';
      io.to(call.from.socketId).emit('call-connected');
      io.to(call.to.socketId).emit('call-connected');
    }
  });

  socket.on('reject-call', ({ callId }) => {
    const call = activeCalls.find(c => c.id === callId);
    if (call) {
      call.status = 'rejected';
      call.endTime = new Date().toISOString();
      io.to(call.from.socketId).emit('call-rejected');
      callHistory.unshift({ ...call, duration: 0 });
      writeJSON(CALLS_FILE, callHistory);
      activeCalls = activeCalls.filter(c => c.id !== callId);
    }
  });

  socket.on('end-call', ({ callId }) => {
    const call = activeCalls.find(c => c.id === callId);
    if (call) {
      const duration = Math.floor((Date.now() - new Date(call.startTime)) / 1000);
      call.status = 'completed';
      call.endTime = new Date().toISOString();
      call.duration = duration;

      [call.from.socketId, call.to.socketId].forEach(id => id && io.to(id).emit('call-ended', { duration }));

      callHistory.unshift({ ...call });
      writeJSON(CALLS_FILE, callHistory);
      activeCalls = activeCalls.filter(c => c.id !== callId);
    }
  });

  socket.on('disconnect', () => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.online = false;
      user.socketId = null;
      writeJSON(USERS_FILE, users);
    }
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-updated', onlineUsers);
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`App lista en http://localhost:${PORT}/app`);
});
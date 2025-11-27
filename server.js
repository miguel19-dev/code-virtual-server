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
    cb(null, 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo imágenes'));
  }
});

// Archivos y carpetas
const USERS_FILE = 'data/users.json';
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars', { recursive: true });

// Helpers JSON
function readJSON(file) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []; }
  catch { return []; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
}

let users = readJSON(USERS_FILE);
let onlineUsers = [];

// Rutas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

// Registro
app.post('/api/register', upload.single('avatar'), async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password || password.length < 6) {
      return res.status(400).json({ error: 'Nombre y contraseña requeridos (mín. 6 caracteres)' });
    }
    if (users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const newUser = {
      id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
      name: name.trim(),
      password: await bcrypt.hash(password, 10),
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '/default-avatar.png',
      online: false,
      socketId: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const { password: _, ...safeUser } = newUser;
    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    user.online = true;
    writeJSON(USERS_FILE, users);

    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Socket.IO
io.on('connection', socket => {
  console.log('Usuario conectado:', socket.id);

  socket.on('user-login', userData => {
    const user = users.find(u => u.id === userData.id);
    if (user) {
      user.socketId = socket.id;
      const entry = {
        id: user.id,
        name: user.name,
        avatar: user.avatar || '/default-avatar.png',
        socketId: socket.id
      };
      const existing = onlineUsers.find(u => u.id === user.id);
      if (existing) Object.assign(existing, entry);
      else onlineUsers.push(entry);
      io.emit('users-updated', onlineUsers);
    }
  });

  socket.on('initiate-call', ({ fromUser, toUserId }) => {
    const toUser = onlineUsers.find(u => u.id == toUserId);
    if (!toUser) return socket.emit('call-error', { message: 'Usuario no conectado' });

    const callId = Date.now();
    io.to(toUser.socketId).emit('incoming-call', { callId, fromUser });
    socket.emit('call-initiated', { callId, toUser });
  });

  socket.on('webrtc-offer', data => io.to(data.to).emit('webrtc-offer', { ...data, from: socket.id }));
  socket.on('webrtc-answer', data => io.to(data.to).emit('webrtc-answer', { ...data, from: socket.id }));
  socket.on('webrtc-ice-candidate', data => io.to(data.to).emit('webrtc-ice-candidate', { ...data, from: socket.id }));

  socket.on('answer-call', ({ callId }) => io.emit('call-connected', { callId }));
  socket.on('end-call', ({ callId }) => io.emit('call-ended', { callId }));

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-updated', onlineUsers);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`CallBlue corriendo en http://localhost:${PORT}`);
  console.log(`Login: http://localhost:${PORT}`);
  console.log(`App:   http://localhost:${PORT}/app`);
});
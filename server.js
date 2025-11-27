const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer para subir avatar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Archivos de datos
const USERS_FILE = 'data/users.json';
if (!fs.existsSync('data')) fs.mkdirSync('data');

function readJSON(file) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : []; }
 catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = readJSON(USERS_FILE);
let onlineUsers = [];

// Rutas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

// Registro
app.post('/api/register', upload.single('avatar'), async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password || password.length < 6 || users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Datos inválidos o usuario existente' });
  }
  const newUser = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    name: name.trim(),
    password: await bcrypt.hash(password, 10),
    avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '/default-avatar.png'
  };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  const { password: _, ...safe } = newUser;
  res.json({ user: safe });
});

// Login
app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

// Socket.IO – Todo en tiempo real
io.on('connection', socket => {
  socket.on('user-login', userData => {
    const user = users.find(u => u.id === userData.id);
    if (user) {
      user.socketId = socket.id;
      const entry = { id: user.id, name: user.name, avatar: user.avatar };
      const existing = onlineUsers.find(u => u.id === user.id);
      if (existing) Object.assign(existing, entry);
      else onlineUsers.push(entry);
      io.emit('users-updated', onlineUsers.filter(u => users.some(us => us.id === u.id)));
    }
  });

  socket.on('initiate-call', ({ fromUser, toUserId }) => {
    const toUser = onlineUsers.find(u => u.id == toUserId);
    if (!toUser) return;
    const callId = Date.now() + Math.random();
    // Avisar al que recibe
    io.to(toUser.socketId).emit('incoming-call', { callId, fromUser });
    // Confirmar al que llama
    socket.emit('call-ringing', { callId, toUser });
  });

  socket.on('webrtc-offer', data => io.to(data.toSocketId).emit('webrtc-offer', data));
  socket.on('webrtc-answer', data => io.to(data.toSocketId).emit('webrtc-answer', data));
  socket.on('webrtc-ice-candidate', data => io.to(data.toSocketId).emit('webrtc-ice-candidate', data));

  socket.on('call-accepted', ({ callId }) => io.emit('call-connected', { callId }));
  socket.on('call-rejected', ({ callId }) => io.emit('call-rejected', { callId }));
  socket.on('call-ended', ({ callId }) => io.emit('call-ended', { callId }));

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-updated', onlineUsers);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`CallBlue corriendo en http://localhost:${PORT}`));
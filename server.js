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

// Crear carpetas
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars', { recursive: true });
if (!fs.existsSync('data')) fs.mkdirSync('data');

const upload = multer({
  dest: 'uploads/avatars/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo imágenes'))
});

const USERS_FILE = 'data/users.json';
let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web.html')));

app.post('/api/register', upload.single('avatar'), async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password || password.length < 6 || users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Usuario ya existe o datos inválidos' });
  }
  const newUser = {
    id: Date.now(),
    name: name.trim(),
    password: await bcrypt.hash(password, 10),
    avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '/default-avatar.png'
  };
  users.push(newUser);
  saveUsers();
  const { password: _, ...safe } = newUser;
  res.json({ user: safe });
});

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

let onlineUsers = [];

io.on('connection', socket => {
  socket.on('login', user => {
    const entry = { id: user.id, name: user.name, avatar: user.avatar || '/default-avatar.png', socketId: socket.id };
    onlineUsers = onlineUsers.filter(u => u.id !== user.id);
    onlineUsers.push(entry);
    io.emit('online-users', onlineUsers);
  });

  socket.on('call-user', ({ to, from }) => {
    const target = onlineUsers.find(u => u.id === to.id);
    if (target) {
      io.to(target.socketId).emit('incoming-call', { from, callId: Date.now() });
      socket.emit('calling', { to });
    }
  });

  socket.on('webrtc-offer', data => io.to(data.target).emit('webrtc-offer', data));
  socket.on('webrtc-answer', data => io.to(data.target).emit('webrtc-answer', data));
  socket.on('webrtc-ice', data => io.to(data.target).emit('webrtc-ice', data));

  socket.on('accept-call', id => socket.to(id).emit('call-accepted'));
  socket.on('end-call', () => io.emit('call-ended'));

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('online-users', onlineUsers);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`CallBlue listo en http://localhost:${PORT}`));
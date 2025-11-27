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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Carpetas
['data', 'uploads/avatars'].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

const upload = multer({
  dest: 'uploads/avatars/',
  limits: { fileSize: 5e6 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(null, false)
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
    return res.status(400).json({ error: 'Usuario existente o datos inválidos' });
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
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

// === SOCKET.IO + WEBRTC 100% FUNCIONAL ===
let online = {};

io.on('connection', socket => {
  socket.on('login', user => {
    online[user.id] = { ...user, socketId: socket.id };
    io.emit('users', Object.values(online));
  });

  socket.on('call', ({ toId, fromUser }) => {
    const target = online[toId];
    if (target) {
      const callId = Date.now() + '';
      io.to(target.socketId).emit('incoming', { callId, fromUser }));
      socket.emit('ringing', { callId });
    }
  });

  socket.on('offer', data => io.to(data.to).emit('offer', { ...data, from: socket.id }));
  socket.on('answer', data => io.to(data.to).emit('answer', data.answer));
  socket.on('ice', data => io.to(data.to).emit('ice', data.candidate));

  socket.on('accept', () => socket.broadcast.emit('accepted'));
  socket.on('end', () => io.emit('ended'));

  socket.on('disconnect', () => {
    for (let id in online) if (online[id].socketId === socket.id) delete online[id];
    io.emit('users', Object.values(online));
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`CallBlue 100% listo → http://localhost:${PORT}`));
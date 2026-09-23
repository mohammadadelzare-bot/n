const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

const sessions = new Map();
const devices = new Map();

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

app.get('/t/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessions.has(sessionId)) {
    return res.status(404).send('Session not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'target.html'));
});

app.post('/api/session/create', (req, res) => {
  const sessionId = uuidv4().substr(0, 8);
  sessions.set(sessionId, {
    id: sessionId,
    created: Date.now(),
    connected: false
  });
  res.json({ sessionId, url: `/t/${sessionId}` });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('register-controller', (sessionId) => {
    socket.join(`controller-${sessionId}`);
    socket.sessionId = sessionId;
    console.log(`Controller registered for session: ${sessionId}`);
  });

  socket.on('register-target', ({ sessionId, deviceInfo }) => {
    socket.join(`target-${sessionId}`);
    socket.sessionId = sessionId;

    const session = sessions.get(sessionId);
    if (session) {
      session.connected = true;
      session.deviceInfo = deviceInfo;
    }

    devices.set(socket.id, { sessionId, ...deviceInfo });

    io.to(`controller-${sessionId}`).emit('target-online', {
      deviceInfo,
      timestamp: Date.now()
    });

    console.log(`Target connected to session: ${sessionId}`);
  });

  socket.on('screen-frame', (data) => {
    const device = devices.get(socket.id);
    if (device) {
      io.to(`controller-${device.sessionId}`).emit('frame', data);
    }
  });

  socket.on('command', ({ sessionId, command, data }) => {
    io.to(`target-${sessionId}`).emit('execute-command', { command, data });
  });

  socket.on('disconnect', () => {
    const device = devices.get(socket.id);
    if (device) {
      io.to(`controller-${device.sessionId}`).emit('target-offline');
      const session = sessions.get(device.sessionId);
      if (session) session.connected = false;
      devices.delete(socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📱 Control panel: http://localhost:${PORT}`);
  console.log(`\n✅ Ready for deployment\n`);
});

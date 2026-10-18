import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import authRoutes from './routes/auth.js';
import cvRoutes from './routes/cv.js';
import directorRoutes from './routes/director.js';
import governanceRoutes from './routes/governance.js';
import incidentRoutes from './routes/incidents.js';
import miscRoutes from './routes/misc.js';
import { maskIncidentForRole } from './services/piiMasking.js';
import { bus } from './state/incidentStore.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // evidence frames arrive as base64 JPEGs

app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/director', directorRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api', miscRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  const role = socket.handshake.auth?.role || socket.handshake.query?.role;
  socket.data.role = role;
  socket.join(`role:${role}`);

  socket.on('disconnect', () => {});
});

function broadcast(eventName, incident) {
  for (const role of ['admin', 'caregiver', 'family']) {
    const masked = maskIncidentForRole(incident, role);
    // A withdrawn consent purpose yields nothing to send to that room.
    if (!masked) continue;
    io.to(`role:${role}`).emit(eventName, masked);
  }
}

bus.on('incident:new', (incident) => broadcast('incident:new', incident));
bus.on('incident:update', (incident) => broadcast('incident:update', incident));
bus.on('incident:alert', (incident) => broadcast('incident:alert', incident));
bus.on('demo:reset', () => io.emit('demo:reset', {}));

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`CareVS server listening on http://localhost:${PORT}`);
});

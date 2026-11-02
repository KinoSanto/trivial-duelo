
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { validateBank } from './bank.js';
import { MemoryHistory, PostgresHistory } from './rotation.js';

const app = express();
const http = createServer(app);
const io = new Server(http);

// Rutas absolutas de los archivos del proyecto
const root = path.dirname(fileURLToPath(import.meta.url));

// Servir la página principal del Trivial
app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

// Cargar las preguntas
const bank = JSON.parse(
  readFileSync(path.join(root, 'questions.json'), 'utf8')
);

validateBank(bank);
const rooms = new Map();
const DURATION = 25;
const MAX_PLAYERS = 8;
const QUESTION_COUNTS = [10, 20, 30, 40, 50];

// Persistent history is mandatory on Render/production; never silently fall back.
const persistent = Boolean(process.env.DATABASE_URL);
if (!persistent && (process.env.RENDER || process.env.NODE_ENV === 'production')) {
  throw new Error('DATABASE_URL es obligatoria en producción para conservar el historial.');
}
const history = persistent ? new PostgresHistory(new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 10000, max: 5
})) : new MemoryHistory();
await history.ready();
app.get('/health', async (req, res) => {
  try { await history.healthy(); res.json({ ok: true, persistent, questions: bank.length }); }
  catch { res.status(503).json({ ok: false }); }
});

// Generar código de sala
const code = () =>
  Array.from(
    { length: 5 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]
  ).join('');

// Actualizar información de la sala
function emitRoom(r) {
  io.to(r.code).emit('room', {
    code: r.code,
    players: r.players.map(p => ({
      name: p.name,
      score: p.score,
      connected: p.connected
    })),
    status: r.status,
    difficulty: r.difficulty,
    hostId: r.players[0].id,
    round: r.round + 1,
    total: r.total,
    duration: DURATION,
    maxPlayers: MAX_PLAYERS
  });
}

// Enviar una pregunta a ambos jugadores
function question(r) {
  if (r.round >= r.total) {
    r.status = 'finished';
    clearTimeout(r.timer);

    io.to(r.code).emit('finished', {
      players: r.players.map(p => ({
        name: p.name,
        score: p.score
      }))
    });

    emitRoom(r);
    setTimeout(() => { if (rooms.get(r.code) === r) rooms.delete(r.code); }, 15 * 60 * 1000).unref();
    return;
  }

  r.status = 'playing';
  r.answers = {};

  const q = r.questions[r.round];

  r.deadline = Date.now() + DURATION * 1000;

  io.to(r.code).emit('question', {
    round: r.round + 1,
    total: r.total,
    duration: DURATION,
    maxPlayers: MAX_PLAYERS,
    category: q.category,
    difficulty: q.difficulty,
    cefr: q.cefr,
    text: q.text,
    options: q.options,
    deadline: r.deadline
  });

  emitRoom(r);

  r.timer = setTimeout(
    () => reveal(r),
    DURATION * 1000 + 200
  );
}

// Mostrar respuesta correcta y sumar puntos
function reveal(r) {
  if (r.status !== 'playing') return;

  clearTimeout(r.timer);
  r.status = 'reveal';

  const q = r.questions[r.round];

  for (const p of r.players) {
    if (r.answers[p.id] === q.correct) {
      p.score += 100;
    }
  }

  io.to(r.code).emit('reveal', {
    correct: q.correct,
    explanation: q.explanation,
    answers: r.players.map(p => ({
      name: p.name,
      answer: r.answers[p.id] ?? null,
      score: p.score
    }))
  });

  emitRoom(r);

  r.timer = setTimeout(() => {
    r.round++;
    question(r);
  }, 4500);
}

// Enviar mensajes de error
function err(socket, message) {
  socket.emit('errorMessage', message);
}

// Conexiones de los jugadores
io.on('connection', socket => {

  socket.use((packet, next) => {
    if (['create','join','answer'].includes(packet[0]) &&
        (!packet[1] || typeof packet[1] !== 'object' || Array.isArray(packet[1]))) {
      err(socket, 'Datos no válidos.');
      return;
    }
    next();
  });

  // Crear una sala
  socket.on('create', ({ name, difficulty = 'mixed', total = 20 } = {}) => {
    if (!QUESTION_COUNTS.includes(total)) return err(socket, 'Elige 10, 20, 30, 40 o 50 preguntas.');
    if (socket.data.room) return err(socket, 'Ya estás en una sala. Recarga para salir.');
    if (!['mixed','easy','medium','hard'].includes(difficulty)) return err(socket, 'Nivel no válido.');
    name = typeof name === 'string' ? name.trim().slice(0, 22) : '';

    if (!name) {
      return err(socket, 'Introduce tu nombre.');
    }

    let c;

    do {
      c = code();
    } while (rooms.has(c));

    const r = {
      code: c,
      players: [{
        id: socket.id,
        name,
        score: 0,
        connected: true
      }],
      questions: [],
      difficulty,
      total,
      round: 0,
      status: 'waiting',
      timer: null,
      answers: {}
    };

    rooms.set(c, r);
    socket.join(c);
    socket.data.room = c;

    emitRoom(r);
  });

  // Unirse a una sala
  socket.on('join', ({ code: c, name } = {}) => {
    if (socket.data.room) return err(socket, 'Ya estás en una sala. Recarga para salir.');
    c = typeof c === 'string' ? c.trim().toUpperCase() : '';
    name = typeof name === 'string' ? name.trim().slice(0, 22) : '';

    const r = rooms.get(c);

    if (!name) {
      return err(socket, 'Introduce tu nombre.');
    }

    if (!r) {
      return err(socket, 'Sala no encontrada.');
    }

    if (r.status !== 'waiting' || r.players.length >= MAX_PLAYERS) {
      return err(
        socket,
        'La sala ya está completa o ha comenzado.'
      );
    }

    r.players.push({
      id: socket.id,
      name,
      score: 0,
      connected: true
    });

    socket.join(c);
    socket.data.room = c;

    emitRoom(r);
  });

  // Comenzar la partida
  socket.on('start', async () => {
    const r = rooms.get(socket.data.room);

    if (
      !r ||
      r.players[0]?.id !== socket.id ||
      r.players.length < 2 ||
      r.status !== 'waiting'
    ) {
      return err(
        socket,
        'Solo el creador puede comenzar, con al menos dos jugadores conectados.'
      );
    }

    const startToken = {};
    r.startToken = startToken;
    r.status = 'starting';
    emitRoom(r);
    try {
      const reserved = await history.reserve(bank, r.difficulty, r.total);
      if (rooms.get(r.code) !== r || r.status !== 'starting' || r.startToken !== startToken) return;
      r.questions = reserved;
      question(r);
    } catch {
      if (r.status !== 'starting' || r.startToken !== startToken) return;
      r.status = 'waiting';
      emitRoom(r);
      err(socket, 'No se pudo reservar el historial. Inténtalo de nuevo; no se ha iniciado la partida.');
    }
  });

  // Registrar una respuesta
  socket.on('answer', ({ index } = {}) => {
    const r = rooms.get(socket.data.room);

    if (
      !r ||
      r.status !== 'playing' ||
      Date.now() > r.deadline ||
      !r.players.some(p => p.id === socket.id) ||
      Object.hasOwn(r.answers, socket.id) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 3
    ) {
      return;
    }

    r.answers[socket.id] = index;

    socket.emit('answered', { index });

    // Revelar cuando hayan respondido todos los jugadores conectados
    if (r.players.filter(p => p.connected).every(p => Object.hasOwn(r.answers, p.id))) {
      reveal(r);
    }
  });

  // Lobby departures free a slot. Started matches never admit late joiners.
  socket.on('disconnect', () => {
    const r = rooms.get(socket.data.room);
    if (!r) return;
    const p = r.players.find(p => p.id === socket.id);
    if (!p) return;
    p.connected = false;

    if (r.status === 'waiting' && r.players[0].id !== socket.id) {
      r.players = r.players.filter(player => player.id !== socket.id);
      emitRoom(r);
      return;
    }
    if ((r.status === 'waiting' || r.status === 'starting') && r.players[0].id === socket.id) {
      clearTimeout(r.timer);
      r.status = 'finished';
      io.to(r.code).emit('roomClosed', { message: 'El creador ha cerrado la sala. Puedes crear otra.' });
      io.to(r.code).emit('errorMessage', 'El creador ha cerrado la sala.');
      for (const player of r.players) {
        const member = io.sockets.sockets.get(player.id);
        if (member) { member.leave(r.code); member.data.room = null; }
      }
      rooms.delete(r.code);
      return;
    }
    if (r.status === 'starting') {
      // A reservation may be in flight: cancel this start rather than leave it stuck.
      r.status = 'waiting';
      r.players = r.players.filter(player => player.connected);
      emitRoom(r);
      io.to(r.code).emit('errorMessage', 'Un jugador salió al comenzar. El creador puede volver a iniciar.');
      return;
    }
    const connected = r.players.filter(player => player.connected);
    if (r.status !== 'finished' && connected.length < 2) {
      clearTimeout(r.timer);
      r.status = 'finished';
      io.to(r.code).emit('errorMessage', 'Quedan menos de dos jugadores conectados. La partida ha terminado.');
      io.to(r.code).emit('finished', {
        players: r.players.map(player => ({ name: player.name, score: player.score, connected: player.connected }))
      });
    } else if (r.status === 'playing' && connected.every(player => Object.hasOwn(r.answers, player.id))) {
      reveal(r);
    }
    emitRoom(r);
    if (!connected.length) {
      clearTimeout(r.timer);
      rooms.delete(r.code);
    }
  });

});

// Arrancar servidor en Render
const PORT = process.env.PORT || 3000;

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Trivial listo en puerto ${http.address().port}`);
});

process.on('SIGTERM', () => {
  io.close();
  http.close(async () => { await history.close(); process.exit(0); });
});

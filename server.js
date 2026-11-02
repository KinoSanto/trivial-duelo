
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
const http = createServer(app);
const io = new Server(http);

// Rutas absolutas de los archivos del proyecto
const root = path.dirname(fileURLToPath(import.meta.url));

// Servir la página principal del Trivial
app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

// Comprobación del estado del servidor
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Cargar las preguntas
const bank = JSON.parse(
  readFileSync(path.join(root, 'questions.json'), 'utf8')
);

const rooms = new Map();
const DURATION = 20;
const TOTAL = 20;

// Seleccionar 20 preguntas aleatorias
const pick = () => {
  const arr = [...bank];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, TOTAL);
};

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
    round: r.round + 1,
    total: TOTAL
  });
}

// Enviar una pregunta a ambos jugadores
function question(r) {
  if (r.round >= TOTAL) {
    r.status = 'finished';
    clearTimeout(r.timer);

    io.to(r.code).emit('finished', {
      players: r.players.map(p => ({
        name: p.name,
        score: p.score
      }))
    });

    emitRoom(r);
    return;
  }

  r.status = 'playing';
  r.answers = {};

  const q = r.questions[r.round];

  r.deadline = Date.now() + DURATION * 1000;

  io.to(r.code).emit('question', {
    round: r.round + 1,
    total: TOTAL,
    category: q.category,
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

  // Crear una sala
  socket.on('create', ({ name } = {}) => {
    name = String(name || '').trim().slice(0, 22);

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
      questions: pick(),
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
    c = String(c || '').trim().toUpperCase();
    name = String(name || '').trim().slice(0, 22);

    const r = rooms.get(c);

    if (!name) {
      return err(socket, 'Introduce tu nombre.');
    }

    if (!r) {
      return err(socket, 'Sala no encontrada.');
    }

    if (r.status !== 'waiting' || r.players.length >= 2) {
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
  socket.on('start', () => {
    const r = rooms.get(socket.data.room);

    if (
      !r ||
      r.players[0]?.id !== socket.id ||
      r.players.length !== 2 ||
      r.status !== 'waiting'
    ) {
      return err(
        socket,
        'Deben estar los dos jugadores para comenzar.'
      );
    }

    question(r);
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

    // Revelar cuando ambos hayan respondido
    if (Object.keys(r.answers).length === 2) {
      reveal(r);
    }
  });

  // Gestionar desconexiones
  socket.on('disconnect', () => {
    const r = rooms.get(socket.data.room);

    if (!r) return;

    const p = r.players.find(
      p => p.id === socket.id
    );

    if (p) p.connected = false;

    emitRoom(r);

    if (r.status === 'waiting') {
      rooms.delete(r.code);

      io.to(r.code).emit(
        'errorMessage',
        'Se ha cerrado la sala porque se desconectó un jugador.'
      );

    } else if (r.status !== 'finished') {
      clearTimeout(r.timer);

      r.status = 'finished';

      io.to(r.code).emit(
        'errorMessage',
        'Un jugador se ha desconectado. La partida ha terminado.'
      );

      io.to(r.code).emit('finished', {
        players: r.players.map(p => ({
          name: p.name,
          score: p.score
        }))
      });
    }

    setTimeout(() => {
      if (rooms.get(r.code) === r) {
        rooms.delete(r.code);
      }
    }, 15 * 60 * 1000);
  });

});

// Arrancar servidor en Render
const PORT = process.env.PORT || 3000;

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Trivial listo en puerto ${PORT}`);
});

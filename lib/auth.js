const express = require('express');
const jwt = require('jsonwebtoken');
const {
  readDb,
  writeDb,
  hashPassword,
  verifyPassword,
  ensureMasterUser,
  getClientIp
} = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vgc_master_secret_2026';

// Asegurar existencia del usuario maestro
ensureMasterUser().catch(console.error);

// POST /api/auth/register
router.post('/register', async (req, res) => {
  await ensureMasterUser();
  const { username, password } = req.body;
  const clientIp = getClientIp(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 3) {
    return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  const masterName = (process.env.MASTER_USERNAME || 'verd1squo').toLowerCase();
  if (cleanUser.toLowerCase() === masterName) {
    return res.status(400).json({ error: 'Este nombre de usuario está reservado para el administrador.' });
  }

  const db = await readDb();

  // Verificar si la IP está bloqueada
  if (db.blockedIps[clientIp]) {
    const ipBlock = db.blockedIps[clientIp];
    if (ipBlock.type === 'ban') {
      return res.status(403).json({ error: 'Tu dirección IP se encuentra bloqueada permanentemente.', type: 'ban' });
    }
    if (ipBlock.type === 'timeout') {
      if (ipBlock.timeoutUntil > Date.now()) {
        return res.status(403).json({
          error: 'Tu dirección IP está en tiempo fuera.',
          type: 'timeout',
          timeoutUntil: ipBlock.timeoutUntil
        });
      }
    }
  }

  // Verificar si ya existe el usuario
  const exists = db.users.some(u => u.username.toLowerCase() === cleanUser.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
  }

  const newUser = {
    id: 'user_' + Date.now(),
    username: cleanUser,
    passwordHash: hashPassword(password),
    role: 'user',
    status: 'active',
    createdAt: Date.now(),
    lastIp: clientIp,
    lastSeen: Date.now(),
    timeoutUntil: null
  };

  db.users.push(newUser);
  await writeDb(db);

  const token = jwt.sign(
    { id: newUser.id, username: newUser.username, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(201).json({
    success: true,
    token,
    user: {
      username: newUser.username,
      role: newUser.role
    }
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  await ensureMasterUser();
  const { username, password } = req.body;
  const clientIp = getClientIp(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  const db = await readDb();
  const cleanUser = username.trim().toLowerCase();
  const user = db.users.find(u => u.username.toLowerCase() === cleanUser);

  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const isMaster = user.role === 'master';

  // Si no es el usuario maestro, verificar bans y timeouts
  if (!isMaster) {
    // 1. Verificar estado del usuario
    if (user.status === 'banned') {
      return res.status(403).json({
        error: 'Tu cuenta ha sido bloqueada permanentemente por el administrador.',
        type: 'ban'
      });
    }

    if (user.status === 'timeout' || (user.timeoutUntil && user.timeoutUntil > Date.now())) {
      return res.status(403).json({
        error: 'Estás en tiempo fuera para reflexionar.',
        type: 'timeout',
        timeoutUntil: user.timeoutUntil
      });
    }

    // 2. Verificar bloqueo de IP
    if (db.blockedIps[clientIp]) {
      const ipBlock = db.blockedIps[clientIp];
      if (ipBlock.type === 'ban') {
        return res.status(403).json({
          error: 'Tu dirección IP se encuentra bloqueada permanentemente.',
          type: 'ban'
        });
      }
      if (ipBlock.type === 'timeout' && ipBlock.timeoutUntil > Date.now()) {
        return res.status(403).json({
          error: 'Tu dirección IP está en tiempo fuera.',
          type: 'timeout',
          timeoutUntil: ipBlock.timeoutUntil
        });
      }
    }
  }

  // Validar contraseña
  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  // Actualizar última conexión e IP
  user.lastIp = clientIp;
  user.lastSeen = Date.now();
  if (user.timeoutUntil && user.timeoutUntil <= Date.now()) {
    user.status = 'active';
    user.timeoutUntil = null;
  }
  await writeDb(db);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    success: true,
    token,
    user: {
      username: user.username,
      role: user.role
    }
  });
});

module.exports = router;

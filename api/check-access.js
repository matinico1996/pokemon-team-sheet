const express = require('express');
const jwt = require('jsonwebtoken');
const { readDb, writeDb, getClientIp } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vgc_master_secret_2026';

// GET /api/check-access
router.get('/', async (req, res) => {
  const clientIp = getClientIp(req);
  const authHeader = req.headers.authorization;
  let decodedUser = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      decodedUser = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      decodedUser = null;
    }
  }

  // 1. INMUNIDAD TOTAL PARA EL USUARIO MAESTRO
  if (decodedUser && decodedUser.role === 'master') {
    return res.json({ allowed: true, role: 'master', username: decodedUser.username });
  }

  const db = await readDb();

  // 2. Verificar estado del usuario identificado por token
  if (decodedUser && decodedUser.id) {
    const user = db.users.find(u => u.id === decodedUser.id || u.username.toLowerCase() === decodedUser.username.toLowerCase());
    if (user && user.role !== 'master') {
      if (user.status === 'banned') {
        return res.json({ allowed: false, type: 'ban', message: 'Acceso denegado por el administrador.' });
      }
      if (user.status === 'timeout' || (user.timeoutUntil && user.timeoutUntil > Date.now())) {
        return res.json({
          allowed: false,
          type: 'timeout',
          timeoutUntil: user.timeoutUntil,
          message: 'Estás en tiempo fuera para reflexionar.'
        });
      }
      // Si el timeout ya venció, limpiar
      if (user.timeoutUntil && user.timeoutUntil <= Date.now()) {
        user.status = 'active';
        user.timeoutUntil = null;
        await writeDb(db);
      }
    }
  }

  // 3. Verificar estado de la dirección IP
  if (db.blockedIps[clientIp]) {
    const ipBlock = db.blockedIps[clientIp];
    if (ipBlock.type === 'ban') {
      return res.json({ allowed: false, type: 'ban', message: 'Acceso denegado por el administrador.' });
    }
    if (ipBlock.type === 'timeout') {
      if (ipBlock.timeoutUntil > Date.now()) {
        return res.json({
          allowed: false,
          type: 'timeout',
          timeoutUntil: ipBlock.timeoutUntil,
          message: 'Estás en tiempo fuera para reflexionar.'
        });
      } else {
        // Limpiar timeout de IP expirado
        delete db.blockedIps[clientIp];
        await writeDb(db);
      }
    }
  }

  return res.json({
    allowed: true,
    role: decodedUser ? decodedUser.role : 'guest',
    username: decodedUser ? decodedUser.username : null
  });
});

module.exports = router;

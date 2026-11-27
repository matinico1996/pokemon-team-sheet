const express = require('express');
const jwt = require('jsonwebtoken');
const { readDb, writeDb } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vgc_master_secret_2026';

// Middleware de verificación de rol Master
function requireMaster(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'master') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Usuario Maestro.' });
    }
    req.masterUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

router.use(requireMaster);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const db = await readDb();
  const now = Date.now();

  const userList = db.users.map(u => {
    let currentStatus = u.status || 'active';
    if (u.timeoutUntil && u.timeoutUntil > now) {
      currentStatus = 'timeout';
    } else if (u.timeoutUntil && u.timeoutUntil <= now && currentStatus === 'timeout') {
      currentStatus = 'active';
    }

    return {
      id: u.id,
      username: u.username,
      role: u.role,
      status: currentStatus,
      lastIp: u.lastIp || '127.0.0.1',
      lastSeen: u.lastSeen,
      createdAt: u.createdAt,
      timeoutUntil: (u.timeoutUntil && u.timeoutUntil > now) ? u.timeoutUntil : null,
      isMaster: u.role === 'master'
    };
  });

  return res.json({ users: userList });
});

// POST /api/admin/action
router.post('/action', async (req, res) => {
  const { action, username, durationMinutes } = req.body;

  if (!action || !username) {
    return res.status(400).json({ error: 'Acción y nombre de usuario son obligatorios.' });
  }

  const db = await readDb();
  const targetUser = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (targetUser.role === 'master') {
    return res.status(400).json({ error: 'No es posible aplicar sanciones al Usuario Maestro.' });
  }

  const targetIp = targetUser.lastIp || '127.0.0.1';

  if (action === 'timeout') {
    let mins = 15;
    if (typeof durationMinutes === 'string') {
      if (durationMinutes === '15m') mins = 15;
      else if (durationMinutes === '1h') mins = 60;
      else if (durationMinutes === '24h') mins = 1440;
      else mins = parseInt(durationMinutes, 10) || 15;
    } else if (typeof durationMinutes === 'number') {
      mins = durationMinutes;
    }

    const timeoutUntil = Date.now() + (mins * 60 * 1000);
    targetUser.status = 'timeout';
    targetUser.timeoutUntil = timeoutUntil;

    // Bloquear también su IP
    db.blockedIps[targetIp] = {
      type: 'timeout',
      timeoutUntil,
      username: targetUser.username
    };

    await writeDb(db);
    return res.json({
      success: true,
      message: `Timeout de ${mins} minutos aplicado a ${targetUser.username} y su IP (${targetIp}).`,
      user: {
        username: targetUser.username,
        status: 'timeout',
        timeoutUntil
      }
    });
  }

  if (action === 'ban') {
    targetUser.status = 'banned';
    targetUser.timeoutUntil = null;

    // Bloquear IP permanentemente
    db.blockedIps[targetIp] = {
      type: 'ban',
      username: targetUser.username
    };

    await writeDb(db);
    return res.json({
      success: true,
      message: `Usuario ${targetUser.username} e IP (${targetIp}) baneados permanentemente.`,
      user: {
        username: targetUser.username,
        status: 'banned',
        timeoutUntil: null
      }
    });
  }

  if (action === 'unban') {
    targetUser.status = 'active';
    targetUser.timeoutUntil = null;

    // Levantar ban de su IP directa
    if (db.blockedIps[targetIp]) {
      delete db.blockedIps[targetIp];
    }

    // Levantar cualquier otra IP vinculada a este usuario
    for (const [ip, data] of Object.entries(db.blockedIps)) {
      if (data.username && data.username.toLowerCase() === targetUser.username.toLowerCase()) {
        delete db.blockedIps[ip];
      }
    }

    await writeDb(db);
    return res.json({
      success: true,
      message: `Sanciones levantadas exitosamente para ${targetUser.username}.`,
      user: {
        username: targetUser.username,
        status: 'active',
        timeoutUntil: null
      }
    });
  }

  return res.status(400).json({ error: 'Acción no reconocida. Use timeout, ban o unban.' });
});

module.exports = router;

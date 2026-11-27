const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'local-db.json');

// Detección automática: Si existen variables de Vercel KV o Upstash, usar nube; si no, archivo local
let redis = null;
const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (kvUrl && kvToken) {
  redis = new Redis({
    url: kvUrl,
    token: kvToken
  });
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function readDb() {
  if (redis) {
    try {
      const data = await redis.get('vgc_db');
      if (!data) {
        const initial = { users: [], blockedIps: {} };
        await redis.set('vgc_db', initial);
        return initial;
      }
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (!parsed.users) parsed.users = [];
      if (!parsed.blockedIps) parsed.blockedIps = {};
      return parsed;
    } catch (err) {
      console.error('[DB] Error leyendo de Redis:', err);
      return { users: [], blockedIps: {} };
    }
  }

  // Fallback local
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const initialDb = { users: [], blockedIps: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = [];
    if (!parsed.blockedIps) parsed.blockedIps = {};
    return parsed;
  } catch (err) {
    console.error('Error al leer local-db.json, reinicializando...', err);
    return { users: [], blockedIps: {} };
  }
}

async function writeDb(data) {
  if (redis) {
    try {
      await redis.set('vgc_db', data);
      return;
    } catch (err) {
      console.error('[DB] Error escribiendo en Redis:', err);
    }
  }

  // Fallback local
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

async function ensureMasterUser() {
  const db = await readDb();
  const masterUsername = process.env.MASTER_USERNAME || 'verd1squo';
  const masterPassword = process.env.MASTER_PASSWORD || 'BLACKxs2345';

  const masterIndex = db.users.findIndex(
    u => u.username.toLowerCase() === masterUsername.toLowerCase()
  );

  if (masterIndex === -1) {
    db.users.push({
      id: 'master_1',
      username: masterUsername,
      passwordHash: hashPassword(masterPassword),
      role: 'master',
      status: 'active',
      createdAt: Date.now(),
      lastIp: '127.0.0.1',
      lastSeen: Date.now(),
      timeoutUntil: null
    });
    await writeDb(db);
    console.log(`[AUTH] Usuario Maestro asegurado: ${masterUsername}`);
  } else {
    if (db.users[masterIndex].role !== 'master') {
      db.users[masterIndex].role = 'master';
      await writeDb(db);
    }
  }
}

function getClientIp(req) {
  const raw = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const clean = raw.replace(/^.*:/, '');
  return clean === '1' ? '127.0.0.1' : clean || '127.0.0.1';
}

module.exports = {
  readDb,
  writeDb,
  hashPassword,
  verifyPassword,
  ensureMasterUser,
  getClientIp
};

require('dotenv').config();
const express = require('express');
const { ensureMasterUser } = require('../lib/db');

const authRouter = require('../lib/auth');
const checkAccessRouter = require('../lib/check-access');
const adminRouter = require('../lib/admin');

const app = express();

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicialización perezosa y segura del usuario maestro
let masterEnsured = false;
app.use(async (req, res, next) => {
  if (!masterEnsured) {
    masterEnsured = true;
    try {
      await ensureMasterUser();
    } catch (err) {
      console.error('[API] Error asegurando usuario maestro:', err);
    }
  }
  next();
});

// Ping de estado
app.get(['/api', '/api/ping', '/ping'], (req, res) => {
  res.json({ status: 'ok', service: 'vgc-api' });
});

// Rutas de autenticación
app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

// Rutas de verificación de acceso
app.use('/api/check-access', checkAccessRouter);
app.use('/check-access', checkAccessRouter);

// Rutas de administración
app.use('/api/admin', adminRouter);
app.use('/admin', adminRouter);

// Manejador de errores global para evitar caídas de Lambda
app.use((err, req, res, next) => {
  console.error('[API ERROR]:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor.' });
});

module.exports = (req, res) => {
  return app(req, res);
};

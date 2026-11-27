require('dotenv').config();
const express = require('express');
const { ensureMasterUser } = require('../lib/db');

const authRouter = require('../lib/auth');
const checkAccessRouter = require('../lib/check-access');
const adminRouter = require('../lib/admin');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

ensureMasterUser().catch(console.error);

app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

app.use('/api/check-access', checkAccessRouter);
app.use('/check-access', checkAccessRouter);

app.use('/api/admin', adminRouter);
app.use('/admin', adminRouter);

app.all('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

module.exports = app;

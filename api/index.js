require('dotenv').config();
const express = require('express');
const { ensureMasterUser } = require('./db');

const authRouter = require('./auth');
const checkAccessRouter = require('./check-access');
const adminRouter = require('./admin');

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

module.exports = app;

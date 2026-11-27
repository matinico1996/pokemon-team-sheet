const path = require('path');
const express = require('express');
const app = require('./api/index');

const PORT = process.env.PORT || 3000;

// Servir archivos estáticos del frontend desde la raíz del proyecto
app.use(express.static(path.join(__dirname)));

// Fallback para servir index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor local
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Servidor VGC Local corriendo en: http://localhost:${PORT}`);
  console.log(` Usuario Maestro: ${process.env.MASTER_USERNAME || 'verd1squo'}`);
  console.log(`======================================================\n`);
});

const express = require('express');
const path = require('path');
const app = require('./src/app');
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'src', 'views')));

app.get('/cliente', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'views', 'cliente.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'views', 'admin.html'));
});

app.get('/relatorios', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'views', 'relatorios.html'));
});

app.get('/', (req, res) => {
    res.redirect('/cliente');
});

app.listen(PORT, () => {
    console.log(`\n🚀 SISAGEND Ativo! Teste nos links abaixo:\n`);
    console.log(`💻 Tela do Cliente:    http://localhost:${PORT}/cliente`);
    console.log(`🔧 Painel Admin:      http://localhost:${PORT}/admin`);
    console.log(`📊 Relatórios TCC:    http://localhost:${PORT}/relatorios\n`);
});

const process = require('node:process');
// Carrega as variáveis locais quando existe .env; outros erros de leitura são propagados.
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./src/routes');
const AuthController = require('./src/controller/authController');
const app = express();
const PORT = Number(process.env.SISAGEND_PORT) || 3001;

// Prepara a aplicação para receber JSON e requisições do front-end.
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.redirect('/cliente.html'));

// Protege a página administrativa antes de disponibilizar os arquivos estáticos.
app.get('/profissionais.html', AuthController.requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'htmlTrabalho', 'profissionais.html'));
});
app.get('/catalogo-admin.html', AuthController.requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'htmlTrabalho', 'catalogo-admin.html'));
});
app.get('/relatorios.html', AuthController.requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'htmlTrabalho', 'relatorios.html'));
});
app.get('/clientes-admin.html', AuthController.requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'htmlTrabalho', 'clientes-admin.html'));
});
app.get('/agendamento.html', AuthController.requireClientPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'htmlTrabalho', 'agendamento.html'));
});
app.use(express.static(path.join(__dirname, 'htmlTrabalho')));
app.use(routes);

if (require.main === module) {
  const database = require('./src/database/connection');
  // Não aceita tráfego até as migrações garantirem que o esquema acompanha esta versão.
  database.migrate.latest({ directory: path.join(__dirname, 'src/database/migrations') })
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[SISAGEND] Servidor online em http://localhost:${PORT}`);
      });
    })
    .catch(error => {
      console.error('[SISAGEND] Não foi possível preparar o banco de dados:', error);
      database.destroy().finally(() => { process.exitCode = 1; });
    });
}

module.exports = app;

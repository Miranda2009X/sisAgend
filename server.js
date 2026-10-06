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
app.use(express.static(path.join(__dirname, 'htmlTrabalho')));
app.use(routes);

app.listen(PORT, () => {
  console.log(`[SISAGEND] Servidor online em http://localhost:${PORT}`);
});

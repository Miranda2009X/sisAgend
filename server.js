const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./src/routes');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.redirect('/cliente.html'));
app.use(express.static(path.join(__dirname, 'htmlTrabalho')));
app.use(routes);

app.listen(PORT, () => {
  console.log(`[SISAGEND] Servidor online em http://localhost:${PORT}`);
});

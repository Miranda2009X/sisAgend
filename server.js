const express = require('express');
const routes = require('./src/routes');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(routes);

app.listen(PORT, () => {
  console.log(`[SISAGEND] Servidor online em http://localhost:${PORT}`);
});

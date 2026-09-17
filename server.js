const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  return res.json({ message: "Servidor do SISAGEND rodando com sucesso! 🚀" });
});

app.listen(PORT, () => {
  console.log(`[SISAGEND] Servidor online em http://localhost:${PORT}`);
});

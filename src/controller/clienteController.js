const db = require('../database/connection');

module.exports = {
  async listar(req, res) {
    try {
      const clientes = await db('CLIENTE').select('id_cliente', 'nome', 'telefone', 'email', 'data_cadastro');
      return res.json(clientes);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
};

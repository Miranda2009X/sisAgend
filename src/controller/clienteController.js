const db = require('../database/connection');
const erroInterno = require('../utils/erro');

module.exports = {
  async listar(req, res) {
    try {
      // Fornece ao agendamento apenas os dados de identificação necessários.
      const clientes = await db('CLIENTE').select('id_cliente', 'nome');
      return res.json(clientes);
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};

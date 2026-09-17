const db = require('../database/connection');

module.exports = {
  async listar(req, res) {
    try {
      const servicos = await db('SERVICO')
        .join('CATEGORIA_SERVICO', 'SERVICO.id_categoria', '=', 'CATEGORIA_SERVICO.id_categoria')
        .select('SERVICO.*', 'CATEGORIA_SERVICO.nome_categoria')
        .where('SERVICO.ativo', true);
      return res.json(servicos);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
};

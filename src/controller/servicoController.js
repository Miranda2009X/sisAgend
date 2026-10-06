const db = require('../database/connection');
const erroInterno = require('../utils/erro');

module.exports = {
  async listar(req, res) {
    try {
      // Inclui o nome da categoria e oculta serviços desativados do catálogo.
      const servicos = await db('SERVICO')
        .join('CATEGORIA_SERVICO', 'SERVICO.id_categoria', '=', 'CATEGORIA_SERVICO.id_categoria')
        .select('SERVICO.*', 'CATEGORIA_SERVICO.nome_categoria')
        .where('SERVICO.ativo', true);
      return res.json(servicos);
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};

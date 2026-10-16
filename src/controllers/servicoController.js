// Fornece ao site público somente os serviços ativos do catálogo.
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

module.exports = {
  async listar(req, res) {
    try {
      // O catálogo público só expõe serviços ativos; a administração mantém a lista completa.
      const servicos = await db('SERVICO')
        .join('CATEGORIA_SERVICO', 'SERVICO.id_categoria', '=', 'CATEGORIA_SERVICO.id_categoria')
        .select(
          'SERVICO.id_servico',
          'SERVICO.id_categoria',
          'SERVICO.nome_servico',
          'SERVICO.preco',
          'SERVICO.duracao_minutos',
          'SERVICO.descricao',
          'SERVICO.imagem_url',
          'CATEGORIA_SERVICO.nome_categoria'
        )
        .where('SERVICO.ativo', true);
      return res.json(servicos);
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};

const procedimentos = [
  { nome_servico: 'Corte de cabelo', preco: 80, duracao_minutos: 60 },
  { nome_servico: 'Escova e finalizacao', preco: 70, duracao_minutos: 60 },
  { nome_servico: 'Hidratacao capilar', preco: 90, duracao_minutos: 60 },
  { nome_servico: 'Coloracao', preco: 180, duracao_minutos: 120 },
  { nome_servico: 'Trancas', preco: 220, duracao_minutos: 180 },
  { nome_servico: 'Cronograma capilar', preco: 150, duracao_minutos: 120 }
];

exports.up = async function(knex) {
  let categoria = await knex('CATEGORIA_SERVICO')
    .where('nome_categoria', 'Procedimentos capilares')
    .first();

  if (!categoria) {
    const [id_categoria] = await knex('CATEGORIA_SERVICO').insert({ nome_categoria: 'Procedimentos capilares' });
    categoria = { id_categoria };
  }

  for (const procedimento of procedimentos) {
    const existe = await knex('SERVICO')
      .where({ id_categoria: categoria.id_categoria, nome_servico: procedimento.nome_servico })
      .first();

    if (!existe) {
      await knex('SERVICO').insert({
        ...procedimento,
        id_categoria: categoria.id_categoria,
        ativo: true
      });
    }
  }
};

exports.down = async function(knex) {
  const categoria = await knex('CATEGORIA_SERVICO')
    .where('nome_categoria', 'Procedimentos capilares')
    .first();

  if (categoria) {
    await knex('SERVICO').where('id_categoria', categoria.id_categoria).del();
    await knex('CATEGORIA_SERVICO').where('id_categoria', categoria.id_categoria).del();
  }
};

exports.up = async function(knex) {
  await knex.schema.alterTable('SERVICO', function(table) {
    table.text('descricao').nullable();
    table.string('imagem_url').nullable();
  });

  await knex('SERVICO')
    .whereRaw('LOWER(nome_servico) LIKE ?', ['%tranc%'])
    .update({
      descricao: 'Referência de tranças para inspirar seu próximo visual.',
      imagem_url: '/imagens/box-braids.jpg'
    });
  await knex('SERVICO')
    .whereRaw('LOWER(nome_servico) LIKE ?', ['%hidrat%'])
    .update({
      descricao: 'Cuidado capilar para nutrir os fios e complementar seu momento de beleza.',
      imagem_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Hair_Oil_Treatment_at_Hair_Salon.jpg/960px-Hair_Oil_Treatment_at_Hair_Salon.jpg'
    });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('SERVICO', function(table) {
    table.dropColumn('imagem_url');
    table.dropColumn('descricao');
  });
};

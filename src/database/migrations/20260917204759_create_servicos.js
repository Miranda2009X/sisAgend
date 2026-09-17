exports.up = function(knex) {
  return knex.schema.createTable('SERVICO', function(table) {
    table.increments('id_servico').primary();
    table.integer('id_categoria').unsigned().notNullable();
    table.string('nome_servico').notNullable();
    table.decimal('preco', 10, 2).notNullable();
    table.integer('duracao_minutos').notNullable();
    table.boolean('ativo').defaultTo(true);

    table.foreign('id_categoria').references('id_categoria').inTable('CATEGORIA_SERVICO');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('SERVICO');
};

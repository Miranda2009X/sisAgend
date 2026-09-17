exports.up = function(knex) {
  return knex.schema.createTable('CATEGORIA_SERVICO', function(table) {
    table.increments('id_categoria').primary();
    table.string('nome_categoria').notNullable().unique();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('CATEGORIA_SERVICO');
};

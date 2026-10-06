exports.up = function(knex) {
  // Armazena os dados do cliente e o hash da senha, com e-mail único.
  return knex.schema.createTable('CLIENTE', function(table) {
    table.increments('id_cliente').primary();
    table.string('nome').notNullable();
    table.string('telefone').notNullable();
    table.string('email').notNullable().unique();
    table.string('senha_hash').notNullable();
    table.timestamp('data_cadastro').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('CLIENTE');
};

exports.up = function(knex) {
  // Desativação lógica mantém as chaves usadas pelos agendamentos históricos.
  return knex.schema.alterTable('CLIENTE', function(table) {
    table.boolean('ativo').notNullable().defaultTo(true);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('CLIENTE', function(table) {
    table.dropColumn('ativo');
  });
};
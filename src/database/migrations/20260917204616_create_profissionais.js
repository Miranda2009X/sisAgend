exports.up = function(knex) {
  return knex.schema.createTable('PROFISSIONAL', function(table) {
    table.increments('id_professional').primary();
    table.string('nome').notNullable();
    table.string('telefone').notNullable();
    table.boolean('ativo').defaultTo(true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('PROFISSIONAL');
};

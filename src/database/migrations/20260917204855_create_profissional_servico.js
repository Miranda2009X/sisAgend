exports.up = function(knex) {
  return knex.schema.createTable('PROFISSIONAL_SERVICO', function(table) {
    table.integer('id_profissional').unsigned().notNullable();
    table.integer('id_servico').unsigned().notNullable();

    table.primary(['id_profissional', 'id_servico']);

    table.foreign('id_profissional').references('id_professional').inTable('PROFISSIONAL');
    table.foreign('id_servico').references('id_servico').inTable('SERVICO');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('PROFISSIONAL_SERVICO');
};

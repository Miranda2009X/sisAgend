exports.up = function(knex) {
  return knex.schema.createTable('AGENDAMENTO', function(table) {
    table.increments('id_agendamento').primary();
    table.integer('id_cliente').unsigned().notNullable();
    table.integer('id_profissional').unsigned().notNullable();
    table.integer('id_servico').unsigned().notNullable();
    table.datetime('data_hora_inicio').notNullable();
    table.datetime('data_hora_fim').notNullable();
    table.string('status').notNullable().defaultTo('Pendente');

    table.foreign('id_cliente').references('id_cliente').inTable('CLIENTE');
    table.foreign('id_profissional').references('id_professional').inTable('PROFISSIONAL');
    table.foreign('id_servico').references('id_servico').inTable('SERVICO');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('AGENDAMENTO');
};

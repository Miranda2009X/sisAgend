// Indexa as consultas frequentes de disponibilidade, agenda e histórico do cliente.
exports.up = async function(knex) {
  await knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.index(['id_profissional', 'data_hora_inicio', 'data_hora_fim'], 'idx_agendamento_profissional_horario');
    table.index(['id_cliente', 'data_hora_inicio'], 'idx_agendamento_cliente_horario');
    table.index(['data_hora_inicio'], 'idx_agendamento_inicio');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.dropIndex(['id_profissional', 'data_hora_inicio', 'data_hora_fim'], 'idx_agendamento_profissional_horario');
    table.dropIndex(['id_cliente', 'data_hora_inicio'], 'idx_agendamento_cliente_horario');
    table.dropIndex(['data_hora_inicio'], 'idx_agendamento_inicio');
  });
};

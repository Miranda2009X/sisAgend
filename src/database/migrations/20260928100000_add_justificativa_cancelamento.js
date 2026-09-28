exports.up = function(knex) {
  return knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.text('justificativa_cancelamento').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.dropColumn('justificativa_cancelamento');
  });
};

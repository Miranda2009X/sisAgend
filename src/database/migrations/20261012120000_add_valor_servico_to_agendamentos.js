exports.up = async function(knex) {
  // O snapshot evita que a edição do preço no catálogo altere relatórios antigos.
  await knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.decimal('valor_servico', 10, 2).nullable();
  });

  // Preenche reservas legadas com o preço vigente ao aplicar esta migração.
  await knex.raw(`
    UPDATE AGENDAMENTO
    SET valor_servico = (
      SELECT preco FROM SERVICO WHERE SERVICO.id_servico = AGENDAMENTO.id_servico
    )
    WHERE valor_servico IS NULL
  `);
};

exports.down = function(knex) {
  return knex.schema.alterTable('AGENDAMENTO', function(table) {
    table.dropColumn('valor_servico');
  });
};
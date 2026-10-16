// Vincula e-mail e hash de senha à conta individual da profissional.
exports.up = function(knex) {
  return knex.schema.alterTable('PROFISSIONAL', function(table) {
    table.string('email').unique();
    table.string('senha_hash');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('PROFISSIONAL', function(table) {
    table.dropColumn('senha_hash');
    table.dropColumn('email');
  });
};

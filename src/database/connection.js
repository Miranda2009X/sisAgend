const knex = require('knex');
const path = require('path');

// Compartilha o pool SQLite e permite apontar testes para um banco isolado.
const connection = knex({
  client: 'sqlite3',
  connection: {
    filename: process.env.SISAGEND_DB_PATH || path.join(__dirname, 'database.sqlite')
  },
  useNullAsDefault: true
});

module.exports = connection;

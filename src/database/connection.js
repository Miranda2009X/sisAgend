const knex = require('knex');
const path = require('path');

// Compartilha uma única conexão SQLite entre os controllers e as rotas.
const connection = knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'database.sqlite')
  },
  useNullAsDefault: true
});

module.exports = connection;

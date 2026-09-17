const knex = require('knex');

const connection = knex({
  client: 'sqlite3',
  connection: {
    filename: 'C:/Users/Diogo/Documents/sisAgend/src/database.sqlite'
  },
  useNullAsDefault: true
});

module.exports = connection;

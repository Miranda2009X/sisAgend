// Centraliza a configuração de Knex para desenvolvimento e migrações.
const path = require('path');

module.exports = {
  development: {
    // Usa o mesmo banco configurável do servidor e mantém migrations na raiz do projeto.
    client: 'sqlite3',
    connection: {
      filename: process.env.SISAGEND_DB_PATH || path.join(__dirname, 'src/database/database.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/database/migrations')
    }
  }
};

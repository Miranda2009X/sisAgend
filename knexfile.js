module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './src/database.sqlite'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './src/database/migrations'
    }
  }
};

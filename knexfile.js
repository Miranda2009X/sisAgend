module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: 'C:/Users/Diogo/Documents/sisAgend/src/database.sqlite'
    },
    useNullAsDefault: true,
    migrations: {
      directory: 'C:/Users/Diogo/Documents/sisAgend/src/database/migrations'
    }
  }
};

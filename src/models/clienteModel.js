const db = require('../config/db');

const ClienteModel = {
    criar: async (nome, telefone, email, senha) => {
        const query = 'INSERT INTO clientes (nome, telefone, email, senha) VALUES (?, ?, ?, ?)';
        const [result] = await db.execute(query, [nome, telefone, email, senha]);
        return result.insertId;
    },

    buscarPorEmail: async (email) => {
        const query = 'SELECT * FROM clientes WHERE email = ?';
        const [rows] = await db.execute(query, [email]);
        return rows[0];
    },

    buscarPorId: async (id) => {
        const query = 'SELECT id_cliente, nome, telefone, email, data_cadastro FROM clientes WHERE id_cliente = ?';
        const [rows] = await db.execute(query, [id]);
        return rows[0];
    },

    listarTodos: async () => {
        const query = 'SELECT id_cliente, nome, telefone, email, data_cadastro FROM clientes';
        const [rows] = await db.execute(query);
        return rows;
    },

    atualizar: async (id, nome, telefone, email) => {
        const query = 'UPDATE clientes SET nome = ?, telefone = ?, email = ? WHERE id_cliente = ?';
        const [result] = await db.execute(query, [nome, telefone, email, id]);
        return result.affectedRows > 0;
    },

    deletar: async (id) => {
        const query = 'DELETE FROM clientes WHERE id_cliente = ?';
        const [result] = await db.execute(query, [id]);
        return result.affectedRows > 0;
    }
};

module.exports = ClienteModel;

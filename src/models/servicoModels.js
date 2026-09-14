const db = require('../config/db');

const ServicoModel = {
    criar: async (nome_servico, preco, duracao_min) => {
        const query = 'INSERT INTO servicos (nome_servico, preco, duracao_min) VALUES (?, ?, ?)';
        const [result] = await db.execute(query, [nome_servico, preco, duracao_min]);
        return result.insertId;
    },

    buscarPorId: async (id) => {
        const query = 'SELECT * FROM servicos WHERE id_servico = ?';
        const [rows] = await db.execute(query, [id]);
        return rows;
    },

    listarTodos: async () => {
        const query = 'SELECT * FROM servicos';
        const [rows] = await db.execute(query);
        return rows;
    },

    atualizar: async (id, nome_servico, preco, duracao_min) => {
        const query = 'UPDATE servicos SET nome_servico = ?, preco = ?, duracao_min = ? WHERE id_servico = ?';
        const [result] = await db.execute(query, [nome_servico, preco, duracao_min, id]);
        return result.affectedRows > 0;
    },

    deletar: async (id) => {
        const query = 'DELETE FROM servicos WHERE id_servico = ?';
        const [result] = await db.execute(query, [id]);
        return result.affectedRows > 0;
    }
};

module.exports = ServicoModel;
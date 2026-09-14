const db = require('../config/db');

const ProfissionalModel = {
    criar: async (nome, specialty, telefone) => {
        const query = 'INSERT INTO profissionais (nome, especialidade, telefone) VALUES (?, ?, ?)';
        const [result] = await db.execute(query, [nome, specialty, telefone]);
        return result.insertId;
    },

    buscarPorId: async (id) => {
        const query = 'SELECT * FROM profissionais WHERE id_profissional = ?';
        const [rows] = await db.execute(query, [id]);
        return rows;
    },

    listarTodos: async () => {
        const query = 'SELECT * FROM profissionais';
        const [rows] = await db.execute(query);
        return rows;
    },

    atualizar: async (id, nome, specialty, telefone, ativo) => {
        const query = 'UPDATE profissionais SET nome = ?, especialidade = ?, telefone = ?, ativo = ? WHERE id_profissional = ?';
        const [result] = await db.execute(query, [nome, specialty, telefone, ativo, id]);
        return result.affectedRows > 0;
    },

    deletar: async (id) => {
        const query = 'DELETE FROM profissionais WHERE id_profissional = ?';
        const [result] = await db.execute(query, [id]);
        return result.affectedRows > 0;
    }
};

module.exports = ProfissionalModel;

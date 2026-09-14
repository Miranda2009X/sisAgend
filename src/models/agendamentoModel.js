const db = require('../config/db');

const AgendamentoModel = {
    criar: async (id_cliente, id_profissional, id_servico, data_agendamento, hora_inicio, hora_fim) => {
        const query = 'INSERT INTO agendamentos (id_cliente, id_profissional, id_servico, data_agendamento, hora_inicio, hora_fim) VALUES (?, ?, ?, ?, ?, ?)';
        const [result] = await db.execute(query, [id_cliente, id_profissional, id_servico, data_agendamento, hora_inicio, hora_fim]);
        return result.insertId;
    },

    buscarPorId: async (id) => {
        const query = `
            SELECT a.*, c.nome AS cliente_nome, p.nome AS profissional_nome, s.nome_servico 
            FROM agendamentos a
            JOIN clientes c ON a.id_cliente = c.id_cliente
            JOIN profissionais p ON a.id_profissional = p.id_profissional
            JOIN servicos s ON a.id_servico = s.id_servico
            WHERE a.id_agendamento = ?
        `;
        const [rows] = await db.execute(query, [id]);
        return rows;
    },

    listarTodos: async () => {
        const query = `
            SELECT a.*, c.nome AS cliente_nome, p.nome AS profissional_nome, s.nome_servico 
            FROM agendamentos a
            JOIN clientes c ON a.id_cliente = c.id_cliente
            JOIN profissionais p ON a.id_profissional = p.id_profissional
            JOIN servicos s ON a.id_servico = s.id_servico
            ORDER BY a.data_agendamento DESC, a.hora_inicio ASC
        `;
        const [rows] = await db.execute(query);
        return rows;
    },

    verificarConflito: async (id_profissional, data_agendamento, hora_inicio, hora_fim) => {
        const query = `
            SELECT * FROM agendamentos 
            WHERE id_profissional = ? 
              AND data_agendamento = ? 
              AND status IN ('Pendente', 'Confirmado')
              AND (
                (hora_inicio <= ? AND hora_fim > ?) OR
                (hora_inicio < ? AND hora_fim >= ?) OR
                (? <= hora_inicio AND ? >= hora_fim)
              )
        `;
        const [rows] = await db.execute(query, [id_profissional, data_agendamento, hora_inicio, hora_fim, hora_inicio, hora_fim, hora_inicio, hora_fim]);
        return rows;
    },

    atualizarStatus: async (id, status) => {
        const query = 'UPDATE agendamentos SET status = ? WHERE id_agendamento = ?';
        const [result] = await db.execute(query, [status, id]);
        return result.affectedRows > 0;
    }
};

module.exports = AgendamentoModel;

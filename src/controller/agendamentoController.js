 const { listarAgendamentos } = require('../services/agendamentoService');

const listarAgendamentosController = async (req, res) => {
    try {
        const agendamentos = await listarAgendamentos();
        res.json(agendamentos);
    } catch (error) {
        console.error('Erro ao listar agendamentos:', error.message);
        res.status(500).json({ erro: 'Não foi possível carregar os agendamentos.' });
    }
};

module.exports = { listarAgendamentosController };
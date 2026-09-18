const db = require('../database/connection');

module.exports = {
  async agendar(req, res) {
    try {
      const { id_cliente, id_profissional, id_servico, data_hora_inicio, data_hora_fim } = req.body;

      if (!id_cliente || !id_profissional || !id_servico || !data_hora_inicio || !data_hora_fim) {
        return res.status(400).json({ error: "Todos os campos do agendamento são obrigatórios." });
      }

      const conflito = await db('AGENDAMENTO')
        .where('id_profissional', id_profissional)
        .andWhere('status', '!=', 'Cancelado')
        .andWhere('data_hora_inicio', '<', data_hora_fim)
        .andWhere('data_hora_fim', '>', data_hora_inicio)
        .first();

      if (conflito) {
        return res.status(400).json({ error: "Este profissional já possui um agendamento neste horário." });
      }

      await db('AGENDAMENTO').insert({
        id_cliente, id_profissional, id_servico, data_hora_inicio, data_hora_fim, status: 'Pendente'
      });

      return res.status(201).json({ message: "Agendamento realizado com sucesso! 📅" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async listar(req, res) {
    try {
      const { data } = req.query;
      let query = db('AGENDAMENTO')
        .join('CLIENTE', 'AGENDAMENTO.id_cliente', '=', 'CLIENTE.id_cliente')
        .join('PROFISSIONAL', 'AGENDAMENTO.id_profissional', '=', 'PROFISSIONAL.id_professional')
        .join('SERVICO', 'AGENDAMENTO.id_servico', '=', 'SERVICO.id_servico')
        .select(
          'AGENDAMENTO.*',
          'CLIENTE.nome as cliente_nome',
          'PROFISSIONAL.nome as profissional_nome',
          'SERVICO.nome_servico'
        );

      if (data) {
        query.whereLike('data_hora_inicio', `${data}%`);
      }

      const agendamentos = await query;
      return res.json(agendamentos);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async atualizarStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['Pendente', 'Confirmado', 'Concluido', 'Cancelado'].includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
      }

      await db('AGENDAMENTO').where('id_agendamento', id).update({ status });
      return res.json({ message: `Status do agendamento atualizado para ${status}.` });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async reagendar(req, res) {
    try {
      const { id } = req.params;
      const { data_hora_inicio, data_hora_fim } = req.body;

      await db('AGENDAMENTO').where('id_agendamento', id).update({ data_hora_inicio, data_hora_fim });
      return res.json({ message: "Agendamento remarcado com sucesso." });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
};

const db = require('../database/connection');

module.exports = {
  async agendar(req, res) {
    try {
      const { id_cliente, id_profissional, id_servico, data_hora_inicio } = req.body;

      const missingFields = [
        !id_cliente && 'cliente',
        !id_profissional && 'profissional',
        !id_servico && 'serviço',
        !data_hora_inicio && 'data e horário'
      ].filter(Boolean);

      if (missingFields.length) {
        return res.status(400).json({ error: `Preencha: ${missingFields.join(', ')}.` });
      }

      const servico = await db('SERVICO')
        .select('duracao_minutos')
        .where('id_servico', id_servico)
        .first();

      if (!servico) {
        return res.status(400).json({ error: "Serviço não encontrado." });
      }

      const inicio = new Date(data_hora_inicio);
      if (Number.isNaN(inicio.getTime())) {
        return res.status(400).json({ error: "Data e horário inválidos." });
      }
      if (inicio < new Date()) {
        return res.status(400).json({ error: "Escolha uma data e horário a partir de agora." });
      }
      if (inicio.getMinutes() !== 0) {
        return res.status(400).json({ error: "Escolha um horário com hora inteira, como 09:00 ou 14:00." });
      }
      if (!Number.isFinite(Number(servico.duracao_minutos)) || Number(servico.duracao_minutos) <= 0) {
        return res.status(400).json({ error: "Este serviço não possui uma duração válida." });
      }

      const fim = new Date(inicio.getTime() + Number(servico.duracao_minutos) * 60000);
      const formatDateTime = date => {
        const pad = value => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };
      const data_hora_fim = formatDateTime(fim);

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
      const { status, justificativa_cancelamento } = req.body;

      if (!['Pendente', 'Confirmado', 'Concluido', 'Cancelado'].includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
      }
      if (status === 'Cancelado' && !justificativa_cancelamento?.trim()) {
        return res.status(400).json({ error: "A justificativa é obrigatória para cancelar a reserva." });
      }

      await db('AGENDAMENTO').where('id_agendamento', id).update({
        status,
        justificativa_cancelamento: status === 'Cancelado' ? justificativa_cancelamento.trim() : null
      });
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

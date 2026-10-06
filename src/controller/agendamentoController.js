const db = require('../database/connection');
const erroInterno = require('../utils/erro');

const STATUS_VALIDOS = ['Pendente', 'Confirmado', 'Concluido', 'Cancelado'];

// Mantém o formato de data/hora local esperado pelo banco e pela agenda.
const pad = value => String(value).padStart(2, '0');
const formatDateTime = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Regras de negócio compartilhadas por "agendar" e "reagendar".
// Retorna { erro } quando algo é inválido, ou { data_hora_fim } quando está tudo certo.
async function validarHorario({ id_profissional, id_servico, data_hora_inicio, ignorarAgendamento }) {
  const servico = await db('SERVICO')
    .select('duracao_minutos', 'ativo')
    .where('id_servico', id_servico)
    .first();

  if (!servico) return { erro: 'Serviço não encontrado.' };
  if (!servico.ativo) return { erro: 'Este serviço não está disponível para agendamento.' };

  const profissional = await db('PROFISSIONAL')
    .select('ativo')
    .where('id_professional', id_profissional)
    .first();
  if (!profissional || !profissional.ativo) return { erro: 'Esta profissional não está disponível para agendamento.' };

  const inicio = new Date(data_hora_inicio);
  if (Number.isNaN(inicio.getTime())) return { erro: 'Data e horário inválidos.' };
  if (inicio < new Date()) return { erro: 'Escolha uma data e horário a partir de agora.' };
  if (inicio.getMinutes() !== 0) return { erro: 'Escolha um horário com hora inteira, como 09:00 ou 14:00.' };

  const duracao = Number(servico.duracao_minutos);
  if (!Number.isFinite(duracao) || duracao <= 0) return { erro: 'Este serviço não possui uma duração válida.' };

  const data_hora_fim = formatDateTime(new Date(inicio.getTime() + duracao * 60000));

  // Verifica sobreposição de intervalos, ignorando reservas já canceladas.
  const consulta = db('AGENDAMENTO')
    .where('id_profissional', id_profissional)
    .andWhere('status', '!=', 'Cancelado')
    .andWhere('data_hora_inicio', '<', data_hora_fim)
    .andWhere('data_hora_fim', '>', data_hora_inicio);

  // No reagendamento, o próprio agendamento não conta como conflito.
  if (ignorarAgendamento) consulta.andWhere('id_agendamento', '!=', ignorarAgendamento);

  if (await consulta.first()) {
    return { erro: 'Este profissional já possui um agendamento neste horário.' };
  }

  return { data_hora_fim };
}

module.exports = {
  async agendar(req, res) {
    try {
      const { id_profissional, id_servico, data_hora_inicio } = req.body;
      const id_cliente = req.client.id_cliente;

      const missingFields = [
        !id_cliente && 'cliente',
        !id_profissional && 'profissional',
        !id_servico && 'serviço',
        !data_hora_inicio && 'data e horário'
      ].filter(Boolean);

      if (missingFields.length) {
        return res.status(400).json({ error: `Preencha: ${missingFields.join(', ')}.` });
      }

      const { erro, data_hora_fim } = await validarHorario({ id_profissional, id_servico, data_hora_inicio });
      if (erro) return res.status(400).json({ error: erro });

      await db('AGENDAMENTO').insert({
        id_cliente, id_profissional, id_servico, data_hora_inicio, data_hora_fim, status: 'Pendente'
      });

      return res.status(201).json({ message: 'Agendamento realizado com sucesso! 📅' });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async listar(req, res) {
    try {
      const { data } = req.query;
      if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({ error: 'Informe a data da agenda no formato AAAA-MM-DD.' });
      }
      const query = db('AGENDAMENTO')
        .select(
          'id_profissional',
          'id_servico',
          'data_hora_inicio',
          'data_hora_fim',
          'status'
        );

      query.whereLike('data_hora_inicio', `${data}%`);

      return res.json(await query);
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async listarDoCliente(req, res) {
    try {
      const agendamentos = await db('AGENDAMENTO')
        .join('SERVICO', 'AGENDAMENTO.id_servico', '=', 'SERVICO.id_servico')
        .join('PROFISSIONAL', 'AGENDAMENTO.id_profissional', '=', 'PROFISSIONAL.id_professional')
        .select(
          'AGENDAMENTO.id_agendamento',
          'AGENDAMENTO.data_hora_inicio',
          'AGENDAMENTO.data_hora_fim',
          'AGENDAMENTO.status',
          'AGENDAMENTO.justificativa_cancelamento',
          'SERVICO.nome_servico',
          'PROFISSIONAL.nome as profissional_nome'
        )
        .where('AGENDAMENTO.id_cliente', req.client.id_cliente)
        .orderBy('AGENDAMENTO.data_hora_inicio', 'desc');
      return res.json(agendamentos);
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async atualizarStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, justificativa_cancelamento } = req.body;

      if (!STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }
      if (status === 'Cancelado' && !justificativa_cancelamento?.trim()) {
        return res.status(400).json({ error: 'A justificativa é obrigatória para cancelar a reserva.' });
      }

      const atualizados = await db('AGENDAMENTO').where('id_agendamento', id).update({
        status,
        justificativa_cancelamento: status === 'Cancelado' ? justificativa_cancelamento.trim() : null
      });

      if (!atualizados) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      return res.json({ message: `Status do agendamento atualizado para ${status}.` });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async reagendar(req, res) {
    try {
      const { id } = req.params;
      const { data_hora_inicio } = req.body;

      if (!data_hora_inicio) {
        return res.status(400).json({ error: 'Informe a nova data e horário.' });
      }

      const agendamento = await db('AGENDAMENTO').where('id_agendamento', id).first();
      if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      if (agendamento.status === 'Cancelado' || agendamento.status === 'Concluido') {
        return res.status(400).json({ error: `Não é possível remarcar um agendamento ${agendamento.status.toLowerCase()}.` });
      }

      // O horário de término é recalculado pelo servidor, a partir da duração do serviço.
      const { erro, data_hora_fim } = await validarHorario({
        id_profissional: agendamento.id_profissional,
        id_servico: agendamento.id_servico,
        data_hora_inicio,
        ignorarAgendamento: id
      });
      if (erro) return res.status(400).json({ error: erro });

      await db('AGENDAMENTO').where('id_agendamento', id).update({ data_hora_inicio, data_hora_fim });
      return res.json({ message: 'Agendamento remarcado com sucesso.' });
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};

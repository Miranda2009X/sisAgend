const db = require('../database/connection');
const erroInterno = require('../utils/erro');
const { horariosDisponiveis } = require('../utils/disponibilidade');

const STATUS_VALIDOS = ['Pendente', 'Confirmado', 'Concluido', 'Cancelado'];

// Mantém o formato de data/hora local esperado pelo banco e pela agenda.
const pad = value => String(value).padStart(2, '0');
const formatDateTime = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Regras de negócio compartilhadas por disponibilidade, agendamento e reagendamento.
// Além de validar conflitos e expediente, retorna o preço vigente para o histórico.
async function validarHorario({ id_profissional, id_servico, data_hora_inicio, ignorarAgendamento }) {
  const servico = await db('SERVICO')
    .select('duracao_minutos', 'ativo', 'preco')
    .where('id_servico', id_servico)
    .first();

  if (!servico) return { erro: 'Serviço não encontrado.' };
  if (!servico.ativo) return { erro: 'Este serviço não está disponível para agendamento.' };

  const profissional = await db('PROFISSIONAL')
    .select('ativo')
    .where('id_professional', id_profissional)
    .first();
  if (!profissional || !profissional.ativo) return { erro: 'Esta profissional não está disponível para agendamento.' };
  const servicosDaProfissional = await db('PROFISSIONAL_SERVICO')
    .where('id_profissional', id_profissional)
    .pluck('id_servico');
  if (servicosDaProfissional.length && !servicosDaProfissional.includes(Number(id_servico))) {
    return { erro: 'Esta profissional não realiza o serviço selecionado.' };
  }

  const inicio = new Date(data_hora_inicio);
  if (Number.isNaN(inicio.getTime())) return { erro: 'Data e horário inválidos.' };
  if (inicio < new Date()) return { erro: 'Escolha uma data e horário a partir de agora.' };
  if (inicio.getMinutes() !== 0) return { erro: 'Escolha um horário com hora inteira, como 09:00 ou 14:00.' };

  const duracao = Number(servico.duracao_minutos);
  if (!Number.isFinite(duracao) || duracao <= 0) return { erro: 'Este serviço não possui uma duração válida.' };
  const minutosInicio = inicio.getHours() * 60 + inicio.getMinutes();
  if (minutosInicio < 8 * 60 || minutosInicio + duracao > 18 * 60) {
    return { erro: 'Os atendimentos devem começar a partir das 08:00 e terminar até as 18:00.' };
  }

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

  return { data_hora_fim, valor_servico: Number(servico.preco) };
}

module.exports = {
  async disponibilidade(req, res) {
    try {
      const { data, id_profissional, id_servico } = req.query;
      const profissionalId = Number(id_profissional);
      const servicoId = Number(id_servico);
      if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({ error: 'Informe uma data válida no formato AAAA-MM-DD.' });
      }
      const [ano, mes, dia] = data.split('-').map(Number);
      const dataLocal = new Date(ano, mes - 1, dia);
      if (dataLocal.getFullYear() !== ano || dataLocal.getMonth() !== mes - 1 || dataLocal.getDate() !== dia) {
        return res.status(400).json({ error: 'Informe uma data válida no formato AAAA-MM-DD.' });
      }
      if (!Number.isInteger(profissionalId) || profissionalId < 1 || !Number.isInteger(servicoId) || servicoId < 1) {
        return res.status(400).json({ error: 'Selecione uma profissional e um serviço válidos.' });
      }

      const [profissional, servico] = await Promise.all([
        db('PROFISSIONAL').select('ativo').where('id_professional', profissionalId).first(),
        db('SERVICO').select('duracao_minutos', 'ativo').where('id_servico', servicoId).first()
      ]);
      if (!profissional || !profissional.ativo) return res.status(404).json({ error: 'Esta profissional não está disponível.' });
      if (!servico || !servico.ativo) return res.status(404).json({ error: 'Este serviço não está disponível.' });
      const servicosDaProfissional = await db('PROFISSIONAL_SERVICO')
        .where('id_profissional', profissionalId)
        .pluck('id_servico');
      if (servicosDaProfissional.length && !servicosDaProfissional.includes(servicoId)) {
        return res.status(400).json({ error: 'Esta profissional não realiza o serviço selecionado.' });
      }

      const agendamentos = await db('AGENDAMENTO')
        .select('data_hora_inicio', 'data_hora_fim')
        .where('id_profissional', profissionalId)
        .where('status', '!=', 'Cancelado')
        .whereLike('data_hora_inicio', `${data}%`);

      return res.json({ horarios_disponiveis: horariosDisponiveis({
        data,
        duracaoMinutos: Number(servico.duracao_minutos),
        agendamentos
      }) });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

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

      const { erro, data_hora_fim, valor_servico } = await validarHorario({ id_profissional, id_servico, data_hora_inicio });
      if (erro) return res.status(400).json({ error: erro });

      // Guarda o preço do dia para mudanças futuras no catálogo não reescreverem o faturamento.
        await db('AGENDAMENTO').insert({
        id_cliente, id_profissional, id_servico, data_hora_inicio, data_hora_fim, valor_servico, status: 'Pendente'
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
          'AGENDAMENTO.id_profissional',
          'AGENDAMENTO.id_servico',
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

  async cancelarDoCliente(req, res) {
    try {
      const id = Number(req.params.id);
      const justificativa = typeof req.body?.justificativa_cancelamento === 'string'
        ? req.body.justificativa_cancelamento.trim()
        : '';
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Agendamento inválido.' });
      if (!justificativa) return res.status(400).json({ error: 'Informe o motivo do cancelamento.' });
      if (justificativa.length > 500) return res.status(400).json({ error: 'O motivo deve ter no máximo 500 caracteres.' });

      const agendamento = await db('AGENDAMENTO')
        .where({ id_agendamento: id, id_cliente: req.client.id_cliente })
        .first();
      if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      if (['Cancelado', 'Concluido'].includes(agendamento.status)) {
        return res.status(400).json({ error: `Não é possível cancelar um agendamento ${agendamento.status.toLowerCase()}.` });
      }

      await db('AGENDAMENTO').where('id_agendamento', id).update({
        status: 'Cancelado',
        justificativa_cancelamento: justificativa
      });
      return res.json({ message: 'Agendamento cancelado com sucesso.' });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async reagendarDoCliente(req, res) {
    try {
      const id = Number(req.params.id);
      const { data_hora_inicio } = req.body || {};
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Agendamento inválido.' });
      if (!data_hora_inicio) return res.status(400).json({ error: 'Informe a nova data e horário.' });

      const agendamento = await db('AGENDAMENTO')
        .where({ id_agendamento: id, id_cliente: req.client.id_cliente })
        .first();
      if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      if (['Cancelado', 'Concluido'].includes(agendamento.status)) {
        return res.status(400).json({ error: `Não é possível remarcar um agendamento ${agendamento.status.toLowerCase()}.` });
      }

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

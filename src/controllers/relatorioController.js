// Consolida atendimentos e faturamento dentro do período solicitado.
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

function dataValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function diaSeguinte(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function periodoQuery(inicio, fimExclusivo) {
  // Limites semiabertos incluem o último dia inteiro sem depender do formato do timestamp.
  return db('AGENDAMENTO as agendamento')
    .leftJoin('SERVICO as servico', 'agendamento.id_servico', '=', 'servico.id_servico')
    .whereRaw('date(agendamento.data_hora_inicio) >= ?', [inicio])
    .whereRaw('date(agendamento.data_hora_inicio) < ?', [fimExclusivo]);
}

function valorConcluido() {
  // Reservas antigas sem snapshot usam o preço atual como aproximação histórica.
  return db.raw(
    "COALESCE(SUM(CASE WHEN agendamento.status = 'Concluido' THEN COALESCE(agendamento.valor_servico, servico.preco, 0) ELSE 0 END), 0) AS faturamento"
  );
}

module.exports = {
  async listar(req, res) {
    try {
      const { inicio, fim } = req.query;
      if (!dataValida(inicio) || !dataValida(fim) || fim < inicio) {
        return res.status(400).json({ error: 'Informe um período válido com início e fim no formato AAAA-MM-DD.' });
      }
      const diasDoPeriodo = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000;
      if (diasDoPeriodo > 366) {
        return res.status(400).json({ error: 'O período do relatório não pode ultrapassar 367 dias.' });
      }
      const fimExclusivo = diaSeguinte(fim);

      const [totais, porDia, porServico] = await Promise.all([
        periodoQuery(inicio, fimExclusivo)
          .select(
            db.raw('COUNT(*) AS total_atendimentos'),
            db.raw("SUM(CASE WHEN agendamento.status = 'Concluido' THEN 1 ELSE 0 END) AS concluidos"),
            db.raw("SUM(CASE WHEN agendamento.status = 'Confirmado' THEN 1 ELSE 0 END) AS confirmados"),
            db.raw("SUM(CASE WHEN agendamento.status = 'Pendente' THEN 1 ELSE 0 END) AS pendentes"),
            db.raw("SUM(CASE WHEN agendamento.status = 'Cancelado' THEN 1 ELSE 0 END) AS cancelados"),
            valorConcluido()
          )
          .first(),
        periodoQuery(inicio, fimExclusivo)
          .select(db.raw('date(agendamento.data_hora_inicio) AS data'))
          .count({ total_atendimentos: 'agendamento.id_agendamento' })
          .select(valorConcluido())
          .groupByRaw('date(agendamento.data_hora_inicio)')
          .orderBy('data'),
        periodoQuery(inicio, fimExclusivo)
          .select('servico.id_servico', 'servico.nome_servico')
          .count({ total_atendimentos: 'agendamento.id_agendamento' })
          .select(valorConcluido())
          .groupBy('servico.id_servico', 'servico.nome_servico')
          .orderBy('servico.nome_servico')
      ]);

      const resumo = Object.fromEntries(
        ['total_atendimentos', 'concluidos', 'confirmados', 'pendentes', 'cancelados']
          .map(key => [key, Number(totais[key] || 0)])
      );
      resumo.faturamento = Number(totais.faturamento || 0);

      return res.json({
        periodo: { inicio, fim },
        resumo,
        por_dia: porDia.map(item => ({ ...item, total_atendimentos: Number(item.total_atendimentos), faturamento: Number(item.faturamento || 0) })),
        por_servico: porServico.map(item => ({ ...item, total_atendimentos: Number(item.total_atendimentos), faturamento: Number(item.faturamento || 0) }))
      });
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};
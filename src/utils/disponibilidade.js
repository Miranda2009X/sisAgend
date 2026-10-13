const MINUTE_START = 8 * 60;
const MINUTE_END = 18 * 60;

const pad = value => String(value).padStart(2, '0');

// Devolve apenas os horários livres; dados de reservas ficam restritos ao servidor.
function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function horariosDisponiveis({ data, duracaoMinutos, agendamentos, agora = new Date() }) {
  const disponiveis = [];

  // Usa intervalos semiabertos para permitir um atendimento começar quando outro termina.
  for (let minutos = MINUTE_START; minutos < MINUTE_END; minutos += 60) {
    const inicio = new Date(`${data}T${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}:00`);
    const fim = new Date(inicio.getTime() + duracaoMinutos * 60000);
    const fechamento = new Date(`${data}T18:00:00`);
    if (inicio <= agora || fim > fechamento) continue;

    const inicioFormatado = formatLocalDateTime(inicio);
    const fimFormatado = formatLocalDateTime(fim);
    const conflita = agendamentos.some(agendamento =>
      new Date(agendamento.data_hora_inicio) < fim && new Date(agendamento.data_hora_fim) > inicio
    );

    if (!conflita) disponiveis.push(inicioFormatado.slice(11));
  }

  return disponiveis;
}

module.exports = { horariosDisponiveis };
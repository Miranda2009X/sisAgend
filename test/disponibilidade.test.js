const assert = require('node:assert/strict');
const test = require('node:test');
const { horariosDisponiveis } = require('../src/utils/disponibilidade');

// Esses casos cobrem limites de expediente, sobreposição e avanço do relógio local.
test('inclui apenas horários que terminam dentro do expediente', () => {
  const horarios = horariosDisponiveis({
    data: '2099-04-05',
    duracaoMinutos: 120,
    agendamentos: [],
    agora: new Date('2099-04-05T07:00:00')
  });

  assert.equal(horarios[0], '08:00');
  assert.equal(horarios.at(-1), '16:00');
  assert.equal(horarios.includes('17:00'), false);
});

test('remove horários que se sobrepõem a reservas ativas', () => {
  const horarios = horariosDisponiveis({
    data: '2099-04-05',
    duracaoMinutos: 60,
    agendamentos: [{
      data_hora_inicio: '2099-04-05T09:30:00',
      data_hora_fim: '2099-04-05T10:30:00'
    }],
    agora: new Date('2099-04-05T07:00:00')
  });

  assert.equal(horarios.includes('09:00'), false);
  assert.equal(horarios.includes('10:00'), false);
  assert.equal(horarios.includes('11:00'), true);
});

test('não oferece horários passados no dia atual', () => {
  const horarios = horariosDisponiveis({
    data: '2099-04-05',
    duracaoMinutos: 60,
    agendamentos: [],
    agora: new Date('2099-04-05T11:15:00')
  });

  assert.equal(horarios.includes('11:00'), false);
  assert.equal(horarios.includes('12:00'), true);
});
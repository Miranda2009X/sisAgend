const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const knexFactory = require('knex');
const { test } = require('node:test');

test('documented client and admin workflows preserve privacy and history', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sisagend-api-'));
  // O banco temporário impede que os cenários de API alterem dados de desenvolvimento.
  process.env.SISAGEND_DB_PATH = path.join(directory, 'test.sqlite');
  process.env.JWT_SECRET = 'integration-test-secret-with-at-least-32-bytes';
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD = 'AdminPass123!';
  process.env.ADMIN_PASSWORD_HASH = '';

  const config = require('../knexfile').development;
  const database = knexFactory(config);
  let server;
  let applicationDatabase;

  try {
    await database.migrate.latest();
    const [categoryId] = await database('CATEGORIA_SERVICO').insert({ nome_categoria: 'Tranças' });
    const [professionalId] = await database('PROFISSIONAL').insert({ nome: 'Profissional teste', telefone: '4100000000', ativo: true });
    const [serviceId] = await database('SERVICO').insert({
      id_categoria: categoryId,
      nome_servico: 'Trança teste',
      preco: 120,
      duracao_minutos: 60,
      ativo: true
    });
    const [unassignedServiceId] = await database('SERVICO').insert({
      id_categoria: categoryId,
      nome_servico: 'Outro serviço',
      preco: 80,
      duracao_minutos: 60,
      ativo: true
    });
    await database('PROFISSIONAL_SERVICO').insert({ id_profissional: professionalId, id_servico: serviceId });
    const passwordHash = await bcrypt.hash('cliente123', 4);
    const [clientId] = await database('CLIENTE').insert({
      nome: 'Cliente teste',
      telefone: '41999990000',
      email: 'cliente@example.test',
      senha_hash: passwordHash,
      ativo: true
    });
    const [otherClientId] = await database('CLIENTE').insert({
      nome: 'Outro cliente',
      telefone: '41888880000',
      email: 'outro@example.test',
      senha_hash: passwordHash,
      ativo: true
    });

    await database('AGENDAMENTO').insert([
      {
        id_cliente: otherClientId,
        id_profissional: professionalId,
        id_servico: serviceId,
        data_hora_inicio: '2099-04-05T09:30',
        data_hora_fim: '2099-04-05T10:30',
        valor_servico: 120,
        status: 'Confirmado'
      },
      {
        id_cliente: clientId,
        id_profissional: professionalId,
        id_servico: serviceId,
        data_hora_inicio: '2099-04-05T12:00',
        data_hora_fim: '2099-04-05T13:00',
        valor_servico: 75,
        status: 'Concluido'
      }
    ]);

    const app = require('../server');
    applicationDatabase = require('../src/database/connection');
    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const call = (route, options) => fetch(`${baseUrl}${route}`, options);
    const clientLogin = await call('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cliente@example.test', senha: 'cliente123' })
    });
    assert.equal(clientLogin.status, 200);
    const clientCookie = clientLogin.headers.get('set-cookie').split(';', 1)[0];
    const adminLogin = await call('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_PASSWORD })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get('set-cookie').split(';', 1)[0];
    const adminLoginPage = await call('/admin.html', { headers: { Cookie: adminCookie }, redirect: 'manual' });
    assert.equal(adminLoginPage.status, 302);
    assert.equal(adminLoginPage.headers.get('location'), '/profissionais.html');
    const anonymousAdminLoginPage = await call('/admin.html');
    assert.equal(anonymousAdminLoginPage.status, 200);

    const rawSchedule = await call('/agendamentos?data=2099-04-05', { headers: { Cookie: clientCookie } });
    assert.equal(rawSchedule.status, 401);

    const availabilityQuery = new URLSearchParams({
      data: '2099-04-05',
      id_profissional: String(professionalId),
      id_servico: String(serviceId)
    });
    const availabilityResponse = await call(`/agendamentos/disponibilidade?${availabilityQuery}`, {
      headers: { Cookie: clientCookie }
    });
    assert.equal(availabilityResponse.status, 200);
    const availability = await availabilityResponse.json();
    assert.deepEqual(Object.keys(availability), ['horarios_disponiveis']);
    assert.equal(availability.horarios_disponiveis.includes('09:00'), false);
    assert.equal(availability.horarios_disponiveis.includes('10:00'), false);
    assert.equal(availability.horarios_disponiveis.includes('11:00'), true);
    const incompatibleService = await call(`/agendamentos/disponibilidade?${new URLSearchParams({
      data: '2099-04-05',
      id_profissional: String(professionalId),
      id_servico: String(unassignedServiceId)
    })}`, { headers: { Cookie: clientCookie } });
    assert.equal(incompatibleService.status, 400);

    const booking = await call('/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ id_profissional: professionalId, id_servico: serviceId, data_hora_inicio: '2099-04-05T11:00' })
    });
    assert.equal(booking.status, 201);
    const duplicateBooking = await call('/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ id_profissional: professionalId, id_servico: serviceId, data_hora_inicio: '2099-04-05T11:00' })
    });
    assert.equal(duplicateBooking.status, 400);

    const ownAppointments = await call('/agendamentos/me', { headers: { Cookie: clientCookie } });
    const ownRows = await ownAppointments.json();
    assert.equal(ownRows.length, 2);
    assert.ok(ownRows.every(row => row.nome_servico === 'Trança teste'));
    const ownPending = ownRows.find(row => row.status === 'Pendente');
    const foreignAppointment = await database('AGENDAMENTO').where('id_cliente', otherClientId).first();
    assert.equal(ownPending.id_servico, serviceId);
    const foreignReschedule = await call(`/agendamentos/me/${foreignAppointment.id_agendamento}/reagendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ data_hora_inicio: '2099-04-05T14:00' })
    });
    assert.equal(foreignReschedule.status, 404);
    const clientReschedule = await call(`/agendamentos/me/${ownPending.id_agendamento}/reagendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ data_hora_inicio: '2099-04-05T14:00' })
    });
    assert.equal(clientReschedule.status, 200);
    const clientCancel = await call(`/agendamentos/me/${ownPending.id_agendamento}/cancelar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ justificativa_cancelamento: 'Preciso alterar meus planos.' })
    });
    assert.equal(clientCancel.status, 200);

    const reportResponse = await call('/admin/relatorios?inicio=2099-04-05&fim=2099-04-05', {
      headers: { Cookie: adminCookie }
    });
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    assert.equal(report.resumo.total_atendimentos, 3);
    assert.equal(report.resumo.concluidos, 1);
    assert.equal(report.resumo.faturamento, 75);

    const weeklyResponse = await call('/profissionais/escala?inicio=2099-04-05&fim=2099-04-11', {
      headers: { Cookie: adminCookie }
    });
    assert.equal(weeklyResponse.status, 200);
    const weekly = await weeklyResponse.json();
    assert.equal(weekly.inicio, '2099-04-05');
    assert.equal(weekly.fim, '2099-04-11');
    assert.equal(weekly.profissionais[0].agendamentos.length, 3);

    const invalidWeek = await call('/profissionais/escala?inicio=2099-04-05&fim=2099-04-12', {
      headers: { Cookie: adminCookie }
    });
    assert.equal(invalidWeek.status, 400);

    const updateClient = await call('/clientes/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
      body: JSON.stringify({ telefone: '41777770000' })
    });
    assert.equal(updateClient.status, 200);
    const account = await call('/clientes/me', { headers: { Cookie: clientCookie } });
    assert.equal((await account.json()).telefone, '41777770000');

    const adminClientList = await call('/clientes', { headers: { Cookie: adminCookie } });
    assert.equal(adminClientList.status, 200);
    assert.equal((await adminClientList.json()).length, 2);
    const deactivateClient = await call(`/clientes/${otherClientId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    assert.equal(deactivateClient.status, 204);
    assert.equal(await database('AGENDAMENTO').where('id_cliente', otherClientId).count({ count: '*' }).first().then(row => Number(row.count)), 1);
    assert.equal(await database('CLIENTE').where('id_cliente', otherClientId).first().then(row => row.ativo), 0);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (applicationDatabase) await applicationDatabase.destroy();
    await database.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
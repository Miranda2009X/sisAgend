// Verifica autenticação, permissões, catálogo e fluxos completos da API.
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
  process.env.SISAGEND_UPLOAD_DIR = path.join(directory, 'uploads');

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
    const adminSharedLogin = await call('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_PASSWORD })
    });
    assert.equal(adminSharedLogin.status, 200);
    assert.equal((await adminSharedLogin.json()).tipo, 'admin');
    const sharedAdminCookie = adminSharedLogin.headers.get('set-cookie').split(';', 1)[0];
    assert.match(sharedAdminCookie, /^sisagend_admin=/);
    const sharedAdminAccess = await call('/admin/catalogo', { headers: { Cookie: sharedAdminCookie } });
    assert.equal(sharedAdminAccess.status, 200);

    const imageForm = new FormData();
    imageForm.set('id_categoria', String(categoryId));
    imageForm.set('nome_servico', 'Serviço com imagem');
    imageForm.set('preco', '95');
    imageForm.set('duracao_minutos', '45');
    imageForm.set('descricao', 'Imagem carregada no formulário administrativo.');
    imageForm.set('imagem', new Blob([
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64')
    ], { type: 'image/png' }), 'servico.png');
    const imageServiceResponse = await call('/servicos', {
      method: 'POST',
      headers: { Cookie: sharedAdminCookie },
      body: imageForm
    });
    assert.equal(imageServiceResponse.status, 201);
    const uploadedCatalog = await call('/admin/catalogo', { headers: { Cookie: sharedAdminCookie } });
    const uploadedService = (await uploadedCatalog.json()).servicos.find(service => service.nome_servico === 'Serviço com imagem');
    assert.match(uploadedService.imagem_url, /^\/uploads\/[0-9a-f-]+\.png$/);
    const savedImage = await fs.promises.readFile(path.join(process.env.SISAGEND_UPLOAD_DIR, path.basename(uploadedService.imagem_url)));
    assert.deepEqual(savedImage.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const updatedServiceForm = new FormData();
    updatedServiceForm.set('nome_servico', 'Serviço com imagem atualizado');
    updatedServiceForm.set('id_categoria', String(categoryId));
    updatedServiceForm.set('preco', '105');
    updatedServiceForm.set('duracao_minutos', '50');
    updatedServiceForm.set('descricao', 'Dados atualizados pelo formulário de edição.');
    updatedServiceForm.set('imagem', new Blob([
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64')
    ], { type: 'image/png' }), 'servico-atualizado.png');
    const updateServiceResponse = await call(`/servicos/${uploadedService.id_servico}`, {
      method: 'PUT',
      headers: { Cookie: sharedAdminCookie },
      body: updatedServiceForm
    });
    assert.equal(updateServiceResponse.status, 200);
    const editedCatalog = await call('/admin/catalogo', { headers: { Cookie: sharedAdminCookie } });
    const editedService = (await editedCatalog.json()).servicos.find(service => service.id_servico === uploadedService.id_servico);
    assert.equal(editedService.nome_servico, 'Serviço com imagem atualizado');
    assert.equal(editedService.preco, 105);
    assert.notEqual(editedService.imagem_url, uploadedService.imagem_url);
    const deactivateService = await call(`/servicos/${uploadedService.id_servico}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ ativo: false })
    });
    assert.equal(deactivateService.status, 200);
    const reactivateService = await call(`/servicos/${uploadedService.id_servico}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ ativo: true })
    });
    assert.equal(reactivateService.status, 200);

    const invalidImageForm = new FormData();
    invalidImageForm.set('id_categoria', String(categoryId));
    invalidImageForm.set('nome_servico', 'Serviço com arquivo inválido');
    invalidImageForm.set('preco', '95');
    invalidImageForm.set('duracao_minutos', '45');
    invalidImageForm.set('imagem', new Blob(['não é uma imagem'], { type: 'image/png' }), 'invalida.png');
    const invalidImageResponse = await call('/servicos', {
      method: 'POST',
      headers: { Cookie: sharedAdminCookie },
      body: invalidImageForm
    });
    assert.equal(invalidImageResponse.status, 400);

    const professionalWithoutServices = await call('/profissionais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ nome: 'Profissional sem serviço', telefone: '4100000001', ids_servico: [] })
    });
    assert.equal(professionalWithoutServices.status, 400);

    const createProfessional = await call('/profissionais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({
        nome: 'Profissional nova',
        telefone: '4100000002',
        email: 'profissional.nova@example.test',
        senha: 'prof123',
        ids_servico: [serviceId]
      })
    });
    assert.equal(createProfessional.status, 201);
    const duplicateAccountEmail = await call('/profissionais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({
        nome: 'Conta duplicada',
        telefone: '4100000004',
        email: 'cliente@example.test',
        senha: 'prof123',
        ids_servico: [serviceId]
      })
    });
    assert.equal(duplicateAccountEmail.status, 409);
    const duplicateClientEmail = await call('/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Cadastro duplicado',
        telefone: '4100000005',
        email: 'profissional.nova@example.test',
        senha: 'cliente123'
      })
    });
    assert.equal(duplicateClientEmail.status, 409);
    const publicProfessionalsResponse = await call('/profissionais');
    assert.equal(publicProfessionalsResponse.status, 200);
    const publicProfessionals = await publicProfessionalsResponse.json();
    const createdProfessional = publicProfessionals.find(professional => professional.nome === 'Profissional nova');
    assert.ok(createdProfessional);
    assert.equal(Object.hasOwn(createdProfessional, 'email'), false);
    assert.deepEqual(createdProfessional.ids_servico, [serviceId]);
    const editProfessional = await call(`/profissionais/${createdProfessional.id_profissional}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({
        nome: 'Profissional editada',
        telefone: '4100000003',
        email: 'profissional.editada@example.test',
        senha: 'nova123',
        ids_servico: [serviceId, unassignedServiceId]
      })
    });
    assert.equal(editProfessional.status, 200);
    const editedProfessionals = await (await call('/profissionais')).json();
    const editedProfessional = editedProfessionals.find(professional => professional.id_profissional === createdProfessional.id_profissional);
    assert.equal(editedProfessional.nome, 'Profissional editada');
    assert.deepEqual(editedProfessional.ids_servico, [serviceId, unassignedServiceId]);
    const adminCatalogAfterEdit = await (await call('/admin/catalogo', { headers: { Cookie: sharedAdminCookie } })).json();
    assert.equal(adminCatalogAfterEdit.profissionais.find(professional => professional.id_profissional === createdProfessional.id_profissional).email, 'profissional.editada@example.test');
    const savedProfessional = await database('PROFISSIONAL').where('id_professional', createdProfessional.id_profissional).first();
    assert.notEqual(savedProfessional.senha_hash, 'nova123');
    assert.equal(await bcrypt.compare('nova123', savedProfessional.senha_hash), true);
    const deactivateProfessional = await call(`/profissionais/${createdProfessional.id_profissional}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ ativo: false })
    });
    assert.equal(deactivateProfessional.status, 200);
    const reactivateProfessional = await call(`/profissionais/${createdProfessional.id_profissional}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ ativo: true })
    });
    assert.equal(reactivateProfessional.status, 200);
    const renameCategory = await call(`/categorias/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: sharedAdminCookie },
      body: JSON.stringify({ nome_categoria: 'Categoria renomeada' })
    });
    assert.equal(renameCategory.status, 200);
    const finalCatalog = await call('/admin/catalogo', { headers: { Cookie: sharedAdminCookie } });
    assert.ok((await finalCatalog.json()).categorias.some(category => category.id_categoria === categoryId && category.nome_categoria === 'Categoria renomeada'));

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
    const scheduledProfessional = weekly.profissionais.find(professional => professional.id_profissional === professionalId);
    assert.equal(scheduledProfessional.agendamentos.length, 3);

    const invalidWeek = await call('/profissionais/escala?inicio=2099-04-05&fim=2099-04-12', {
      headers: { Cookie: adminCookie }
    });
    assert.equal(invalidWeek.status, 400);

    const professionalLogin = await call('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'PROFISSIONAL.EDITADA@example.test', senha: 'nova123' })
    });
    assert.equal(professionalLogin.status, 200);
    assert.equal((await professionalLogin.json()).tipo, 'profissional');
    const professionalCookie = professionalLogin.headers.get('set-cookie').split(';', 1)[0];
    assert.match(professionalCookie, /^sisagend_professional=/);
    const allRoleCookies = [sharedAdminCookie, clientCookie, professionalCookie].join('; ');
    assert.equal((await call('/admin/catalogo', { headers: { Cookie: allRoleCookies } })).status, 200);
    assert.equal((await call('/clientes/me', { headers: { Cookie: allRoleCookies } })).status, 200);
    assert.equal((await call('/profissional/sessao', { headers: { Cookie: allRoleCookies } })).status, 200);
    assert.equal((await call('/admin/catalogo', { headers: { Cookie: professionalCookie } })).status, 401);
    assert.equal((await call('/profissional.html', { headers: { Cookie: professionalCookie }, redirect: 'manual' })).status, 200);
    const anonymousProfessionalPage = await call('/profissional.html', { redirect: 'manual' });
    assert.equal(anonymousProfessionalPage.status, 302);
    assert.match(anonymousProfessionalPage.headers.get('location'), /cadastro\.html\?next=/);

    const professionalAppointments = await call('/profissional/agendamentos?data=2099-04-05', {
      headers: { Cookie: professionalCookie }
    });
    assert.equal(professionalAppointments.status, 200);
    assert.equal((await professionalAppointments.json()).agendamentos.length, 0);
    const [firstProfessionalAppointmentId] = await database('AGENDAMENTO').insert({
      id_cliente: clientId,
      id_profissional: createdProfessional.id_profissional,
      id_servico: serviceId,
      data_hora_inicio: '2099-04-06T10:00',
      data_hora_fim: '2099-04-06T11:00',
      valor_servico: 120,
      status: 'Pendente'
    });
    const [secondProfessionalAppointmentId] = await database('AGENDAMENTO').insert({
      id_cliente: clientId,
      id_profissional: createdProfessional.id_profissional,
      id_servico: serviceId,
      data_hora_inicio: '2099-04-06T13:00',
      data_hora_fim: '2099-04-06T14:00',
      valor_servico: 120,
      status: 'Pendente'
    });
    const ownProfessionalSchedule = await call('/profissional/agendamentos?data=2099-04-06', {
      headers: { Cookie: professionalCookie }
    });
    assert.equal((await ownProfessionalSchedule.json()).agendamentos.length, 2);
    const foreignProfessionalAction = await call(`/profissional/agendamentos/${foreignAppointment.id_agendamento}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ status: 'Confirmado' })
    });
    assert.equal(foreignProfessionalAction.status, 404);
    const confirmProfessionalBooking = await call(`/profissional/agendamentos/${firstProfessionalAppointmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ status: 'Confirmado' })
    });
    assert.equal(confirmProfessionalBooking.status, 200);
    const finishProfessionalBooking = await call(`/profissional/agendamentos/${firstProfessionalAppointmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ status: 'Concluido' })
    });
    assert.equal(finishProfessionalBooking.status, 200);
    const rescheduleProfessionalBooking = await call(`/profissional/agendamentos/${secondProfessionalAppointmentId}/reagendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ data_hora_inicio: '2099-04-06T15:00' })
    });
    assert.equal(rescheduleProfessionalBooking.status, 200);
    const missingProfessionalCancelReason = await call(`/profissional/agendamentos/${secondProfessionalAppointmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ status: 'Cancelado' })
    });
    assert.equal(missingProfessionalCancelReason.status, 400);
    const cancelProfessionalBooking = await call(`/profissional/agendamentos/${secondProfessionalAppointmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: professionalCookie },
      body: JSON.stringify({ status: 'Cancelado', justificativa_cancelamento: 'Imprevisto da equipe.' })
    });
    assert.equal(cancelProfessionalBooking.status, 200);
    const loggedOutProfessional = await call('/profissional/logout', {
      method: 'POST',
      headers: { Cookie: professionalCookie }
    });
    assert.equal(loggedOutProfessional.status, 204);
    assert.match(loggedOutProfessional.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await call('/profissional/agendamentos?data=2099-04-06', {
      headers: { Cookie: '' }
    })).status, 401);

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
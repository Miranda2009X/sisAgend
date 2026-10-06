const express = require('express');
const bcrypt = require('bcrypt');
const routes = express.Router();

const db = require('./database/connection');
const ClienteController = require('./controller/clienteController');
const ServicoController = require('./controller/servicoController');
const AgendamentoController = require('./controller/agendamentoController');
const AuthController = require('./controller/authController');
const CatalogController = require('./controller/catalogController');
const erroInterno = require('./utils/erro');

// Cria a conta já armazenando a senha em formato de hash, nunca em texto puro.
routes.post('/clientes', async (req, res) => {
  try {
    if (!AuthController.hasSessionSecret()) {
      return res.status(503).json({ error: 'A autenticação ainda não foi configurada no servidor.' });
    }
    const { nome, telefone, email, senha } = req.body;
    if (!nome || !telefone || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    if (senha.length < 6) return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });

    const emailNormalizado = email.trim().toLowerCase();
    const clienteExistente = await db('CLIENTE').where('email', emailNormalizado).first();
    if (clienteExistente) return res.status(409).json({ error: "Este e-mail já está cadastrado." });

    const senha_hash = await bcrypt.hash(senha, 10);
    const [id_cliente] = await db('CLIENTE').insert({ nome: nome.trim(), telefone: telefone.trim(), email: emailNormalizado, senha_hash });
    await AuthController.registerClientSession(res, { id_cliente });
    return res.status(201).json({ message: 'Cliente cadastrado com sucesso!', cliente: { id_cliente, nome: nome.trim(), email: emailNormalizado } });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/admin/login', AuthController.loginAdmin);
routes.post('/admin/logout', AuthController.logoutAdmin);
routes.post('/cliente/logout', AuthController.logoutClient);
routes.get('/cliente/sessao', AuthController.clientSession);
routes.get('/clientes/me', AuthController.requireClient, (req, res) => res.json(req.client));

// Alterações no catálogo e nos profissionais exigem sessão administrativa.
routes.get('/admin/catalogo', AuthController.requireAdmin, CatalogController.listAdmin);
routes.post('/profissionais', AuthController.requireAdmin, CatalogController.createProfessional);
routes.put('/profissionais/:id', AuthController.requireAdmin, CatalogController.updateProfessional);
routes.post('/categorias', AuthController.requireAdmin, CatalogController.createCategory);
routes.put('/categorias/:id', AuthController.requireAdmin, CatalogController.updateCategory);
routes.post('/servicos', AuthController.requireAdmin, CatalogController.createService);
routes.put('/servicos/:id', AuthController.requireAdmin, CatalogController.updateService);

routes.post('/login', AuthController.login);
routes.get('/clientes', AuthController.requireAdmin, ClienteController.listar);

// Retorna a escala do dia ou de um mês; a validação evita filtros de data ambíguos.
routes.get('/profissionais/escala', AuthController.requireAdmin, async (req, res) => {
  try {
    const hoje = new Date();
    const dataLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const consultaMensal = typeof req.query.mes === 'string';
    const mes = consultaMensal ? req.query.mes : null;
    const data = typeof req.query.data === 'string' ? req.query.data : dataLocal;
    const inicioMes = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
      ? `${mes}-01`
      : null;
    if (consultaMensal && !inicioMes) {
      return res.status(400).json({ error: 'Informe um mês válido no formato AAAA-MM.' });
    }
    if (!consultaMensal && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ error: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
    const proximoMes = inicioMes
      ? new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString().slice(0, 10)
      : null;

    // Busca a equipe e os agendamentos em paralelo; para o mês, usa intervalo semiaberto.
    const [profissionais, agendamentos] = await Promise.all([
      db('PROFISSIONAL')
        .select('id_professional as id_profissional', 'nome', 'telefone', 'ativo')
        .orderBy('nome'),
      (() => {
        const query = db('AGENDAMENTO')
        .join('CLIENTE', 'AGENDAMENTO.id_cliente', '=', 'CLIENTE.id_cliente')
        .join('PROFISSIONAL', 'AGENDAMENTO.id_profissional', '=', 'PROFISSIONAL.id_professional')
        .join('SERVICO', 'AGENDAMENTO.id_servico', '=', 'SERVICO.id_servico')
        .select(
          'AGENDAMENTO.*',
          'CLIENTE.nome as cliente_nome',
          'PROFISSIONAL.nome as profissional_nome',
          'SERVICO.nome_servico',
          'SERVICO.duracao_minutos'
        )
        .orderBy('AGENDAMENTO.data_hora_inicio');
        return inicioMes
          ? query.where('AGENDAMENTO.data_hora_inicio', '>=', inicioMes)
            .where('AGENDAMENTO.data_hora_inicio', '<', proximoMes)
          : query.whereLike('AGENDAMENTO.data_hora_inicio', `${data}%`);
      })()
    ]);

    return res.json({
      data,
      ...(consultaMensal ? { mes } : {}),
      // Agrupa cada agendamento junto ao profissional correspondente.
      profissionais: profissionais.map(profissional => ({
        ...profissional,
        agendamentos: agendamentos.filter(
          agendamento => agendamento.id_profissional === profissional.id_profissional
        )
      }))
    });
  } catch (error) {
    return erroInterno(res, error);
  }
});
routes.get('/profissionais', async (req, res) => {
  try {
    const profissionais = await db('PROFISSIONAL')
      .select('id_professional as id_profissional', 'nome', 'ativo')
      .orderBy('nome');
    return res.json(profissionais);
  } catch (error) {
    return erroInterno(res, error);
  }
});
routes.get('/servicos', ServicoController.listar);

// Operações de agenda; alterações de status e reagendamentos são administrativas.
routes.post('/agendamentos', AuthController.requireClient, AgendamentoController.agendar);
routes.get('/agendamentos/me', AuthController.requireClient, AgendamentoController.listarDoCliente);
routes.get('/agendamentos', AuthController.requireClient, AgendamentoController.listar);
routes.put('/agendamentos/:id/status', AuthController.requireAdmin, AgendamentoController.atualizarStatus);
routes.put('/agendamentos/:id/reagendar', AuthController.requireAdmin, AgendamentoController.reagendar);

module.exports = routes;

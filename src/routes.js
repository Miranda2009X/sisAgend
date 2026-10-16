// Registra endpoints públicos e as rotas protegidas de cada perfil.
const express = require('express');
const bcrypt = require('bcrypt');
const routes = express.Router();

const db = require('./database/connection');
const ClienteController = require('./controllers/clienteController');
const ServicoController = require('./controllers/servicoController');
const AgendamentoController = require('./controllers/agendamentoController');
const AuthController = require('./controllers/authController');
const CatalogController = require('./controllers/catalogController');
const RelatorioController = require('./controllers/relatorioController');
const erroInterno = require('./utils/erro');
const uploadImagem = require('./utils/uploadImagem');

function dataCalendarioValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function somarDias(value, amount) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

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
    const [clienteExistente, profissionalExistente] = await Promise.all([
      db('CLIENTE').whereRaw('lower(email) = ?', [emailNormalizado]).first(),
      db('PROFISSIONAL').whereRaw('lower(email) = ?', [emailNormalizado]).first()
    ]);
    if (clienteExistente || profissionalExistente ||
      emailNormalizado === process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
      return res.status(409).json({ error: "Este e-mail já está associado a outra conta." });
    }

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
routes.post('/profissional/logout', AuthController.logoutProfessional);
routes.get('/cliente/sessao', AuthController.clientSession);
routes.get('/clientes/me', AuthController.requireClient, (req, res) => res.json(req.client));
routes.get('/profissional/sessao', AuthController.requireProfessional, (req, res) => res.json(req.professional));
routes.get('/profissional/agendamentos', AuthController.requireProfessional, AgendamentoController.listarDaProfissional);
routes.put('/profissional/agendamentos/:id/status', AuthController.requireProfessional, AgendamentoController.atualizarStatusDaProfissional);
routes.put('/profissional/agendamentos/:id/reagendar', AuthController.requireProfessional, AgendamentoController.reagendarDaProfissional);

// Alterações no catálogo e nos profissionais exigem sessão administrativa.
routes.get('/admin/catalogo', AuthController.requireAdmin, CatalogController.listAdmin);
routes.get('/admin/relatorios', AuthController.requireAdmin, RelatorioController.listar);
routes.post('/profissionais', AuthController.requireAdmin, CatalogController.createProfessional);
routes.put('/profissionais/:id', AuthController.requireAdmin, CatalogController.updateProfessional);
routes.post('/categorias', AuthController.requireAdmin, CatalogController.createCategory);
routes.put('/categorias/:id', AuthController.requireAdmin, CatalogController.updateCategory);
routes.post('/servicos', AuthController.requireAdmin, uploadImagem, CatalogController.createService);
routes.put('/servicos/:id', AuthController.requireAdmin, uploadImagem, CatalogController.updateService);

routes.post('/login', AuthController.login);
routes.get('/clientes', AuthController.requireAdmin, ClienteController.listar);
routes.put('/clientes/me', AuthController.requireClient, ClienteController.atualizarMinhaConta);
routes.put('/clientes/:id', AuthController.requireAdmin, ClienteController.atualizar);
routes.delete('/clientes/:id', AuthController.requireAdmin, ClienteController.desativar);

// Períodos semanal e mensal usam intervalos semiabertos para cobrir todos os dias selecionados.
routes.get('/profissionais/escala', AuthController.requireAdmin, async (req, res) => {
  try {
    const hoje = new Date();
    const dataLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const consultaMensal = typeof req.query.mes === 'string';
    const consultaSemanal = typeof req.query.inicio === 'string' || typeof req.query.fim === 'string';
    const mes = consultaMensal ? req.query.mes : null;
    const data = typeof req.query.data === 'string' ? req.query.data : dataLocal;
    const inicioSemana = typeof req.query.inicio === 'string' ? req.query.inicio : null;
    const fimSemana = typeof req.query.fim === 'string' ? req.query.fim : null;
    const inicioMes = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
      ? `${mes}-01`
      : null;
    if (consultaMensal && consultaSemanal) {
      return res.status(400).json({ error: 'Escolha uma única visualização da escala.' });
    }
    if (consultaMensal && !inicioMes) {
      return res.status(400).json({ error: 'Informe um mês válido no formato AAAA-MM.' });
    }
    if (consultaSemanal && (!dataCalendarioValida(inicioSemana) || !dataCalendarioValida(fimSemana) || somarDias(inicioSemana, 6) !== fimSemana)) {
      return res.status(400).json({ error: 'Informe o início e o fim de uma semana válida.' });
    }
    if (!consultaMensal && !consultaSemanal && !dataCalendarioValida(data)) {
      return res.status(400).json({ error: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
    const proximoMes = inicioMes
      ? new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString().slice(0, 10)
      : null;
    const proximoDia = consultaSemanal ? somarDias(fimSemana, 1) : null;

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
        if (inicioMes) {
          return query.where('AGENDAMENTO.data_hora_inicio', '>=', inicioMes)
            .where('AGENDAMENTO.data_hora_inicio', '<', proximoMes);
        }
        if (consultaSemanal) {
          return query.where('AGENDAMENTO.data_hora_inicio', '>=', inicioSemana)
            .where('AGENDAMENTO.data_hora_inicio', '<', proximoDia);
        }
        return query.whereLike('AGENDAMENTO.data_hora_inicio', `${data}%`);
      })()
    ]);

    return res.json({
      data,
      ...(consultaMensal ? { mes } : {}),
      ...(consultaSemanal ? { inicio: inicioSemana, fim: fimSemana } : {}),
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
    const [profissionais, associacoes] = await Promise.all([
      db('PROFISSIONAL')
        .select('id_professional as id_profissional', 'nome', 'ativo')
        .orderBy('nome'),
      db('PROFISSIONAL_SERVICO').select('id_profissional', 'id_servico')
    ]);
    const servicosPorProfissional = new Map();
    associacoes.forEach(({ id_profissional, id_servico }) => {
      const ids = servicosPorProfissional.get(id_profissional) || [];
      ids.push(id_servico);
      servicosPorProfissional.set(id_profissional, ids);
    });
    return res.json(profissionais.map(profissional => ({
      ...profissional,
      ids_servico: servicosPorProfissional.get(profissional.id_profissional) || []
    })));
  } catch (error) {
    return erroInterno(res, error);
  }
});
routes.get('/servicos', ServicoController.listar);

// Operações de agenda; alterações de status e reagendamentos são administrativas.
routes.post('/agendamentos', AuthController.requireClient, AgendamentoController.agendar);
routes.get('/agendamentos/me', AuthController.requireClient, AgendamentoController.listarDoCliente);
routes.get('/agendamentos/disponibilidade', AuthController.requireClient, AgendamentoController.disponibilidade);
// As ações do cliente ficam restritas às reservas da sessão; a agenda completa é só administrativa.
routes.put('/agendamentos/me/:id/cancelar', AuthController.requireClient, AgendamentoController.cancelarDoCliente);
routes.put('/agendamentos/me/:id/reagendar', AuthController.requireClient, AgendamentoController.reagendarDoCliente);
routes.get('/agendamentos', AuthController.requireAdmin, AgendamentoController.listar);
routes.put('/agendamentos/:id/status', AuthController.requireAdmin, AgendamentoController.atualizarStatus);
routes.put('/agendamentos/:id/reagendar', AuthController.requireAdmin, AgendamentoController.reagendar);

module.exports = routes;

const express = require('express');
const bcrypt = require('bcrypt');
const routes = express.Router();

const db = require('./database/connection');
const ClienteController = require('./controller/clienteController');
const ServicoController = require('./controller/servicoController');
const AgendamentoController = require('./controller/agendamentoController');
const AuthController = require('./controller/authController');
const erroInterno = require('./utils/erro');

routes.post('/clientes', async (req, res) => {
  try {
    const { nome, telefone, email, senha } = req.body;
    if (!nome || !telefone || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    if (senha.length < 6) return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });

    const emailNormalizado = email.trim().toLowerCase();
    const clienteExistente = await db('CLIENTE').where('email', emailNormalizado).first();
    if (clienteExistente) return res.status(409).json({ error: "Este e-mail já está cadastrado." });

    const senha_hash = await bcrypt.hash(senha, 10);
    await db('CLIENTE').insert({ nome: nome.trim(), telefone: telefone.trim(), email: emailNormalizado, senha_hash });
    return res.status(201).json({ message: "Cliente cadastrado com sucesso! 🎉" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/admin/login', AuthController.loginAdmin);
routes.post('/admin/logout', AuthController.logoutAdmin);

routes.post('/profissionais', AuthController.requireAdmin, async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: "Nome e telefone são obrigatórios." });
    await db('PROFISSIONAL').insert({ nome, telefone, ativo: true });
    return res.status(201).json({ message: "Profissional cadastrado com sucesso! 💇‍♀️" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/categorias', AuthController.requireAdmin, async (req, res) => {
  try {
    const { nome_categoria } = req.body;
    if (!nome_categoria) return res.status(400).json({ error: "Nome da categoria é obrigatório." });
    await db('CATEGORIA_SERVICO').insert({ nome_categoria });
    return res.status(201).json({ message: "Categoria criada com sucesso! 🏷️" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/servicos', AuthController.requireAdmin, async (req, res) => {
  try {
    const { id_categoria, nome_servico, preco, duracao_minutos } = req.body;
    if (!id_categoria || !nome_servico || !preco || !duracao_minutos) return res.status(400).json({ error: "Preencha todos os campos." });
    await db('SERVICO').insert({ id_categoria, nome_servico, preco, duracao_minutos, ativo: true });
    return res.status(201).json({ message: "Serviço cadastrado com sucesso! ⚡" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/login', AuthController.login);
routes.get('/clientes', ClienteController.listar);
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
          'SERVICO.nome_servico'
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

routes.post('/agendamentos', AgendamentoController.agendar);
routes.get('/agendamentos', AgendamentoController.listar);
routes.put('/agendamentos/:id/status', AuthController.requireAdmin, AgendamentoController.atualizarStatus);
routes.put('/agendamentos/:id/reagendar', AuthController.requireAdmin, AgendamentoController.reagendar);

module.exports = routes;

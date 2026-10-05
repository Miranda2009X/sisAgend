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

routes.post('/profissionais', async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: "Nome e telefone são obrigatórios." });
    await db('PROFISSIONAL').insert({ nome, telefone, ativo: true });
    return res.status(201).json({ message: "Profissional cadastrado com sucesso! 💇‍♀️" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/categorias', async (req, res) => {
  try {
    const { nome_categoria } = req.body;
    if (!nome_categoria) return res.status(400).json({ error: "Nome da categoria é obrigatório." });
    await db('CATEGORIA_SERVICO').insert({ nome_categoria });
    return res.status(201).json({ message: "Categoria criada com sucesso! 🏷️" });
  } catch (error) {
    return erroInterno(res, error);
  }
});

routes.post('/servicos', async (req, res) => {
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
routes.get('/profissionais/escala', async (req, res) => {
  try {
    const hoje = new Date();
    const dataLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const data = req.query.data || dataLocal;
    const [profissionais, agendamentos] = await Promise.all([
      db('PROFISSIONAL')
        .select('id_professional as id_profissional', 'nome', 'telefone', 'ativo')
        .orderBy('nome'),
      db('AGENDAMENTO')
        .join('CLIENTE', 'AGENDAMENTO.id_cliente', '=', 'CLIENTE.id_cliente')
        .join('PROFISSIONAL', 'AGENDAMENTO.id_profissional', '=', 'PROFISSIONAL.id_professional')
        .join('SERVICO', 'AGENDAMENTO.id_servico', '=', 'SERVICO.id_servico')
        .whereLike('AGENDAMENTO.data_hora_inicio', `${data}%`)
        .select(
          'AGENDAMENTO.*',
          'CLIENTE.nome as cliente_nome',
          'PROFISSIONAL.nome as profissional_nome',
          'SERVICO.nome_servico'
        )
        .orderBy('AGENDAMENTO.data_hora_inicio')
    ]);

    return res.json({
      data,
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
      .select('id_professional as id_profissional', 'nome', 'telefone', 'ativo')
      .orderBy('nome');
    return res.json(profissionais);
  } catch (error) {
    return erroInterno(res, error);
  }
});
routes.get('/servicos', ServicoController.listar);

routes.post('/agendamentos', AgendamentoController.agendar);
routes.get('/agendamentos', AgendamentoController.listar);
routes.put('/agendamentos/:id/status', AgendamentoController.atualizarStatus);
routes.put('/agendamentos/:id/reagendar', AgendamentoController.reagendar);

module.exports = routes;

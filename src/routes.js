const express = require('express');
const routes = express.Router();

const db = require('./database/connection');
const ClienteController = require('./controller/clienteController');
const ServicoController = require('./controller/servicoController');
const AgendamentoController = require('./controller/agendamentoController');

routes.post('/clientes', async (req, res) => {
  try {
    const { nome, telefone, email, senha_hash } = req.body;
    if (!nome || !telefone || !email || !senha_hash) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    await db('CLIENTE').insert({ nome, telefone, email, senha_hash });
    return res.status(201).json({ message: "Cliente cadastrado com sucesso! 🎉" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

routes.post('/profissionais', async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: "Nome e telefone são obrigatórios." });
    await db('PROFISSIONAL').insert({ nome, telefone, ativo: true });
    return res.status(201).json({ message: "Profissional cadastrado com sucesso! 💇‍♀️" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

routes.post('/categorias', async (req, res) => {
  try {
    const { nome_categoria } = req.body;
    if (!nome_categoria) return res.status(400).json({ error: "Nome da categoria é obrigatório." });
    await db('CATEGORIA_SERVICO').insert({ nome_categoria });
    return res.status(201).json({ message: "Categoria criada com sucesso! 🏷️" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

routes.post('/servicos', async (req, res) => {
  try {
    const { id_categoria, nome_servico, preco, duracao_minutos } = req.body;
    if (!id_categoria || !nome_servico || !preco || !duracao_minutos) return res.status(400).json({ error: "Preencha todos os campos." });
    await db('SERVICO').insert({ id_categoria, nome_servico, preco, duracao_minutos, ativo: true });
    return res.status(201).json({ message: "Serviço cadastrado com sucesso! ⚡" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

routes.get('/clientes', ClienteController.listar);
routes.get('/servicos', ServicoController.listar);

routes.post('/agendamentos', AgendamentoController.agendar);
routes.get('/agendamentos', AgendamentoController.listar);
routes.put('/agendamentos/:id/status', AgendamentoController.atualizarStatus);
routes.put('/agendamentos/:id/reagendar', AgendamentoController.reagendar);

module.exports = routes;

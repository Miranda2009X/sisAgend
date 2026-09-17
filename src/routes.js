const express = require('express');
const routes = express.Router();
const db = require('./database/connection');

routes.post('/clientes', async (req, res) => {
  try {
    const { nome, telefone, email, senha_hash } = req.body;

    if (!nome || !telefone || !email || !senha_hash) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    await db('CLIENTE').insert({
      nome,
      telefone,
      email,
      senha_hash
    });

    return res.status(201).json({ message: "Cliente cadastrado com sucesso!" });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }
    return res.status(500).json({ error: "Erro interno ao cadastrar cliente." });
  }
});

module.exports = routes;

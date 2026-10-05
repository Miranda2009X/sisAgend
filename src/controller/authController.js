const bcrypt = require('bcrypt');
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

module.exports = {
  async login(req, res) {
    try {
      const { email, senha } = req.body;
      if (!email || !senha) {
        return res.status(400).json({ error: 'Informe e-mail e senha.' });
      }

      const cliente = await db('CLIENTE')
        .where('email', String(email).trim().toLowerCase())
        .first();

      // Mesma mensagem para e-mail inexistente e senha errada (não revela qual deu erro).
      const senhaConfere = cliente ? await bcrypt.compare(String(senha), cliente.senha_hash) : false;
      if (!senhaConfere) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      return res.json({
        message: 'Login realizado com sucesso!',
        cliente: {
          id_cliente: cliente.id_cliente,
          nome: cliente.nome,
          email: cliente.email
        }
      });
    } catch (error) {
      return erroInterno(res, error);
    }
  }
};

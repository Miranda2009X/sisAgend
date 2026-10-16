// Expõe operações administrativas e de autoatendimento para clientes.
const bcrypt = require('bcrypt');
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

function campoTexto(body, campo, limite) {
  if (!Object.hasOwn(body, campo)) return undefined;
  if (typeof body[campo] !== 'string') return null;
  const valor = body[campo].trim();
  return valor && valor.length <= limite ? valor : null;
}

function validarEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function atualizarCliente(req, res, id) {
  try {
    const body = req.body || {};
    const atualizacoes = {};
    // Só altera campos enviados; a senha nunca é persistida fora de bcrypt.
    for (const [campo, limite] of [['nome', 120], ['telefone', 30]]) {
      const valor = campoTexto(body, campo, limite);
      if (valor === null) return res.status(400).json({ error: `Informe um ${campo} válido.` });
      if (valor !== undefined) atualizacoes[campo] = valor;
    }
    if (Object.hasOwn(body, 'email')) {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!validarEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
      const [duplicado, profissional] = await Promise.all([
        db('CLIENTE').whereRaw('lower(email) = ?', [email]).whereNot('id_cliente', id).first(),
        db('PROFISSIONAL').whereRaw('lower(email) = ?', [email]).first()
      ]);
      if (duplicado || profissional || email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
        return res.status(409).json({ error: 'Este e-mail já está associado a outra conta.' });
      }
      atualizacoes.email = email;
    }
    if (Object.hasOwn(body, 'senha')) {
      if (typeof body.senha !== 'string' || body.senha.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      }
      atualizacoes.senha_hash = await bcrypt.hash(body.senha, 10);
    }
    if (!Object.keys(atualizacoes).length) return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });

    const cliente = await db('CLIENTE').where({ id_cliente: id, ativo: true }).first();
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
    await db('CLIENTE').where('id_cliente', id).update(atualizacoes);
    const atualizado = await db('CLIENTE').select('id_cliente', 'nome', 'telefone', 'email').where('id_cliente', id).first();
    return res.json({ message: 'Cliente atualizado com sucesso.', cliente: atualizado });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    return erroInterno(res, error);
  }
}

async function desativarCliente(req, res, id) {
  try {
    // Anonimiza os dados pessoais sem apagar reservas que fazem parte do histórico financeiro.
    const atualizados = await db('CLIENTE').where({ id_cliente: id, ativo: true }).update({
      ativo: false,
      nome: 'Cliente desativado',
      telefone: '',
      email: `cliente-inativo-${id}@invalid.local`,
      senha_hash: ''
    });
    if (!atualizados) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.status(204).end();
  } catch (error) {
    return erroInterno(res, error);
  }
}

module.exports = {
  async listar(req, res) {
    try {
      const clientes = await db('CLIENTE')
        .select('id_cliente', 'nome', 'telefone', 'email', 'data_cadastro')
        .where('ativo', true)
        .orderBy('nome');
      return res.json(clientes);
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  atualizar(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Cliente inválido.' });
    return atualizarCliente(req, res, id);
  },

  atualizarMinhaConta(req, res) {
    return atualizarCliente(req, res, req.client.id_cliente);
  },

  desativar(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Cliente inválido.' });
    return desativarCliente(req, res, id);
  }
};

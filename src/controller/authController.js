const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

const ADMIN_COOKIE = 'sisagend_admin';
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

// Recusa sessões administrativas se o segredo não estiver configurado com tamanho mínimo.
function getAdminSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function secureCompare(first, second) {
  const firstHash = crypto.createHash('sha256').update(first).digest();
  const secondHash = crypto.createHash('sha256').update(second).digest();
  return crypto.timingSafeEqual(firstHash, secondHash);
}

function createAdminToken() {
  // Assina o payload e define expiração para permitir sessão sem estado no servidor.
  const payload = Buffer.from(JSON.stringify({
    sub: 'admin',
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getAdminSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isAdminAuthenticated(req) {
  // Valida assinatura e expiração antes de autorizar qualquer rota administrativa.
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return false;

  const token = cookie.slice(ADMIN_COOKIE.length + 1);
  const [payload, signature, extra] = token.split('.');
  const secret = getAdminSecret();
  if (!payload || !signature || extra || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.sub === 'admin' && Number.isInteger(session.exp) && session.exp > Date.now() / 1000;
  } catch (error) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: 'Acesso restrito à área administrativa.' });
  }
  return next();
}

function requireAdminPage(req, res, next) {
  if (!isAdminAuthenticated(req)) return res.redirect('/admin.html');
  return next();
}

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

      // Usa a mesma resposta para evitar revelar se o e-mail está cadastrado.
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
  },

  requireAdmin,
  requireAdminPage,

  async loginAdmin(req, res) {
    const { email, senha } = req.body || {};
    const configuredEmail = process.env.ADMIN_EMAIL;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    const secret = getAdminSecret();

    if (!configuredEmail || !configuredPassword || !secret) {
      return res.status(503).json({ error: 'A autenticação administrativa ainda não foi configurada.' });
    }

    // Compara credenciais em tempo constante e só cria cookie se tudo estiver configurado.
    const emailConfere = secureCompare(String(email || '').trim().toLowerCase(), configuredEmail.trim().toLowerCase());
    const senhaConfere = secureCompare(String(senha || ''), configuredPassword);
    if (!emailConfere || !senhaConfere) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${createAdminToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}${secureFlag}`);
    return res.json({ message: 'Login administrativo realizado com sucesso.' });
  },

  logoutAdmin(req, res) {
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag}`);
    return res.status(204).end();
  }
};

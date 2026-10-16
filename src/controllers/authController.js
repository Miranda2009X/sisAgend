// Autentica os perfis e valida suas sessões independentes.
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

const ADMIN_COOKIE = 'sisagend_admin';
const CLIENT_COOKIE = 'sisagend_client';
const PROFESSIONAL_COOKIE = 'sisagend_professional';
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

// Recusa sessões administrativas se o segredo não estiver configurado com tamanho mínimo.
function getAdminSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function createProfessionalToken(id) {
  const payload = Buffer.from(JSON.stringify({
    sub: `professional:${id}`,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getAdminSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function secureCompare(first, second) {
  const firstHash = crypto.createHash('sha256').update(first).digest();
  const secondHash = crypto.createHash('sha256').update(second).digest();
  return crypto.timingSafeEqual(firstHash, secondHash);
}

async function requireProfessional(req, res, next) {
  const token = getCookie(req, PROFESSIONAL_COOKIE);
  const subject = tokenSubjectFromToken(token);
  const session = subject && subject.startsWith('professional:')
    ? verifyToken(token, subject)
    : false;
  if (!session) return res.status(401).json({ error: 'Entre na sua conta profissional para continuar.' });

  try {
    const professional = await db('PROFISSIONAL')
      .select('id_professional as id_profissional', 'nome', 'email')
      .where('id_professional', Number(session.sub.slice('professional:'.length)))
      .where('ativo', true)
      .first();
    if (!professional) return res.status(401).json({ error: 'A conta profissional não está mais disponível.' });
    req.professional = professional;
    return next();
  } catch (error) {
    return erroInterno(res, error);
  }
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

function requireProfessionalPage(req, res, next) {
  const token = getCookie(req, PROFESSIONAL_COOKIE);
  const subject = tokenSubjectFromToken(token);
  const session = subject && subject.startsWith('professional:')
    ? verifyToken(token, subject)
    : false;
  if (!session) return res.redirect(`/cadastro.html?next=${encodeURIComponent('/profissional.html')}`);
  return requireProfessional(req, res, next);
}

function getCookie(req, name) {
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${name}=`));
  if (!cookie) return false;
  return cookie.slice(name.length + 1);
}

function verifyToken(token, expectedSubject) {
  if (typeof token !== 'string') return false;
  const [payload, signature, extra] = token.split('.');
  const secret = getAdminSecret();
  if (!payload || !signature || extra || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.sub === expectedSubject && Number.isInteger(session.exp) && session.exp > Date.now() / 1000
      ? session
      : false;
  } catch (error) {
    return false;
  }
}

function isAdminAuthenticated(req) {
  return verifyToken(getCookie(req, ADMIN_COOKIE), 'admin');
}

function setSessionCookie(res, name, token) {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSessionCookie(res, `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}${secureFlag}`);
}

function clearSessionCookie(res, name) {
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  appendSessionCookie(res, `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag}`);
}

function appendSessionCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  const cookies = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

function createClientToken(id) {
  const payload = Buffer.from(JSON.stringify({
    sub: `client:${id}`,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getAdminSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: 'Acesso restrito à área administrativa.' });
  }
  return next();
}

async function requireClient(req, res, next) {
  const token = getCookie(req, CLIENT_COOKIE);
  const subject = tokenSubjectFromToken(token);
  const session = subject && subject.startsWith('client:')
    ? verifyToken(token, subject)
    : false;
  if (!session) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });

  try {
    const cliente = await db('CLIENTE')
      .select('id_cliente', 'nome', 'email', 'telefone')
      .where('id_cliente', Number(session.sub.slice('client:'.length)))
      .where('ativo', true)
      .first();
    if (!cliente) return res.status(401).json({ error: 'A conta não está mais disponível. Entre novamente.' });
    req.client = cliente;
    return next();
  } catch (error) {
    return erroInterno(res, error);
  }
}

function requireAdminPage(req, res, next) {
  if (!isAdminAuthenticated(req)) return res.redirect('/admin.html');
  return next();
}

function redirectAuthenticatedAdmin(req, res, next) {
  if (isAdminAuthenticated(req)) return res.redirect('/profissionais.html');
  return next();
}

function requireClientPage(req, res, next) {
  const token = getCookie(req, CLIENT_COOKIE);
  const subject = tokenSubjectFromToken(token);
  const session = subject && subject.startsWith('client:')
    ? verifyToken(token, subject)
    : false;
  if (!session || !session.sub.startsWith('client:')) {
    return res.redirect(`/cadastro.html?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return next();
}

function tokenSubjectFromToken(token) {
  try {
    const [payload] = token.split('.');
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof session.sub === 'string' ? session.sub : '';
  } catch (error) {
    return '';
  }
}

async function authenticateAdmin(req, res) {
  const { email, senha } = req.body || {};
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const configuredPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const secret = getAdminSecret();

  if (!configuredEmail || (!configuredPassword && !configuredPasswordHash) || !secret) {
    return res.status(503).json({ error: 'A autenticação administrativa ainda não foi configurada.' });
  }

  const emailConfere = secureCompare(String(email || '').trim().toLowerCase(), configuredEmail.trim().toLowerCase());
  const senhaConfere = configuredPasswordHash
    ? await bcrypt.compare(String(senha || ''), configuredPasswordHash)
    : secureCompare(String(senha || ''), configuredPassword);
  if (!emailConfere || !senhaConfere) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  setSessionCookie(res, ADMIN_COOKIE, createAdminToken());
  return res.json({ message: 'Login administrativo realizado com sucesso.', tipo: 'admin' });
}

module.exports = {
  async login(req, res) {
    try {
      if (!getAdminSecret()) {
        return res.status(503).json({ error: 'A autenticação ainda não foi configurada no servidor.' });
      }
      const { email, senha } = req.body || {};
      if (!email || !senha) {
        return res.status(400).json({ error: 'Informe e-mail e senha.' });
      }

      const configuredAdminEmail = process.env.ADMIN_EMAIL;
      if (configuredAdminEmail
        && secureCompare(String(email).trim().toLowerCase(), configuredAdminEmail.trim().toLowerCase())) {
        return await authenticateAdmin(req, res);
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const profissional = await db('PROFISSIONAL')
        .where('email', normalizedEmail)
        .where('ativo', true)
        .first();
      const senhaProfissionalConfere = profissional?.senha_hash
        ? await bcrypt.compare(String(senha), profissional.senha_hash)
        : false;
      if (senhaProfissionalConfere) {
        setSessionCookie(res, PROFESSIONAL_COOKIE, createProfessionalToken(profissional.id_professional));
        return res.json({
          message: 'Login profissional realizado com sucesso.',
          tipo: 'profissional',
          profissional: {
            id_profissional: profissional.id_professional,
            nome: profissional.nome,
            email: profissional.email
          }
        });
      }

      const cliente = await db('CLIENTE')
        .where('email', normalizedEmail)
        .where('ativo', true)
        .first();

      // Usa a mesma resposta para evitar revelar se o e-mail está cadastrado.
      const senhaConfere = cliente ? await bcrypt.compare(String(senha), cliente.senha_hash) : false;
      if (!senhaConfere) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      setSessionCookie(res, CLIENT_COOKIE, createClientToken(cliente.id_cliente));
      return res.json({
        message: 'Login realizado com sucesso!',
        cliente: {
          id_cliente: cliente.id_cliente,
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.telefone
        }
      });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async registerClientSession(res, cliente) {
    setSessionCookie(res, CLIENT_COOKIE, createClientToken(cliente.id_cliente));
  },

  requireClient,
  requireClientPage,

  clientSession(req, res) {
    return requireClient(req, res, () => res.json({ cliente: req.client }));
  },

  hasSessionSecret() {
    return Boolean(getAdminSecret());
  },

  logoutClient(req, res) {
    clearSessionCookie(res, CLIENT_COOKIE);
    return res.status(204).end();
  },

  logoutProfessional(req, res) {
    clearSessionCookie(res, PROFESSIONAL_COOKIE);
    return res.status(204).end();
  },

  requireAdmin,
  requireAdminPage,
  redirectAuthenticatedAdmin,
  requireProfessional,
  requireProfessionalPage,

  loginAdmin: authenticateAdmin,

  logoutAdmin(req, res) {
    clearSessionCookie(res, ADMIN_COOKIE);
    return res.status(204).end();
  }
};

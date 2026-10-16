// Gerencia categorias, serviços, profissionais e imagens do catálogo.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('../database/connection');
const erroInterno = require('../utils/erro');

function uploadedImageExtension(file) {
  const { buffer, mimetype } = file;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isGif = buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/);
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const extensions = {
    'image/png': isPng && 'png',
    'image/jpeg': isJpeg && 'jpg',
    'image/gif': isGif && 'gif',
    'image/webp': isWebp && 'webp'
  };
  return extensions[mimetype] || null;
}

async function saveUploadedImage(file, extension) {
  const directory = process.env.SISAGEND_UPLOAD_DIR || path.join(__dirname, '../../public/uploads');
  const filename = `${randomUUID()}.${extension}`;
  const filePath = path.join(directory, filename);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, file.buffer, { flag: 'wx' });
  return { url: `/uploads/${filename}`, filePath };
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalImageUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? trimmed : undefined;
  } catch (error) {
    return undefined;
  }
}

function optionalText(value) {
  if (value == null || value === '') return null;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validActive(value) {
  return typeof value === 'boolean';
}

async function ensureCategory(id) {
  return db('CATEGORIA_SERVICO').where('id_categoria', id).first();
}

async function ensureProfessionalEmailAvailable(email, excludedId) {
  const [professionalQuery, client] = await Promise.all([
    db('PROFISSIONAL').whereRaw('lower(email) = ?', [email]).modify(query => {
      if (excludedId) query.whereNot('id_professional', excludedId);
    }).first(),
    db('CLIENTE').whereRaw('lower(email) = ?', [email]).first()
  ]);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !professionalQuery && !client && email !== adminEmail;
}

module.exports = {
  async listAdmin(req, res) {
    try {
      const [categorias, profissionais, servicos, profissionalServicos] = await Promise.all([
        db('CATEGORIA_SERVICO').select('id_categoria', 'nome_categoria').orderBy('nome_categoria'),
        db('PROFISSIONAL').select('id_professional as id_profissional', 'nome', 'telefone', 'email', 'ativo').orderBy('nome'),
        db('SERVICO')
          .join('CATEGORIA_SERVICO', 'SERVICO.id_categoria', '=', 'CATEGORIA_SERVICO.id_categoria')
          .select('SERVICO.*', 'CATEGORIA_SERVICO.nome_categoria')
          .orderBy('SERVICO.nome_servico'),
        db('PROFISSIONAL_SERVICO').select('id_profissional', 'id_servico')
      ]);
      return res.json({ categorias, profissionais, servicos, profissionalServicos });
    } catch (error) {
      return erroInterno(res, error);
    }
  },

  async createProfessional(req, res) {
    try {
      const nome = optionalText(req.body.nome);
      const telefone = optionalText(req.body.telefone);
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const senha = req.body.senha;
      if (!nome || !telefone || !email || !senha) {
        return res.status(400).json({ error: 'Nome, telefone, e-mail e senha inicial são obrigatórios.' });
      }
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido para o acesso profissional.' });
      }
      if (typeof senha !== 'string' || senha.length < 6) {
        return res.status(400).json({ error: 'A senha inicial deve ter pelo menos 6 caracteres.' });
      }
      const servicos = req.body.ids_servico;
      if (servicos !== undefined && (!Array.isArray(servicos) || servicos.some(id => !positiveInteger(id)))) {
        return res.status(400).json({ error: 'A lista de serviços da profissional é inválida.' });
      }
      const uniqueServices = [...new Set((servicos || []).map(Number))];
      if (!uniqueServices.length) {
        return res.status(400).json({ error: 'Selecione ao menos um serviço realizado pela profissional.' });
      }
      const existingServices = await db('SERVICO').whereIn('id_servico', uniqueServices).pluck('id_servico');
      if (existingServices.length !== uniqueServices.length) {
        return res.status(400).json({ error: 'Um ou mais serviços selecionados não existem.' });
      }
      if (!await ensureProfessionalEmailAvailable(email)) {
        return res.status(409).json({ error: 'Este e-mail já está associado a outra conta.' });
      }
      const senha_hash = await bcrypt.hash(senha, 10);
      const [id_profissional] = await db.transaction(async trx => {
        const [professionalId] = await trx('PROFISSIONAL').insert({
          nome, telefone, email, senha_hash, ativo: true
        });
        if (uniqueServices.length) {
          await trx('PROFISSIONAL_SERVICO').insert(uniqueServices.map(id_servico => ({ id_profissional: professionalId, id_servico })));
        }
        return [professionalId];
      });
      return res.status(201).json({ message: 'Profissional cadastrada com sucesso.', id_profissional });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Este e-mail já está associado a outra conta.' });
      }
      return erroInterno(res, error);
    }
  },

  async updateProfessional(req, res) {
    try {
      const id = positiveInteger(req.params.id);
      const updates = {};
      if (!id) return res.status(400).json({ error: 'Profissional inválido.' });
      if (Object.hasOwn(req.body, 'nome')) {
        updates.nome = optionalText(req.body.nome);
        if (!updates.nome) return res.status(400).json({ error: 'Informe um nome válido.' });
      }
      if (Object.hasOwn(req.body, 'telefone')) {
        updates.telefone = optionalText(req.body.telefone);
        if (!updates.telefone) return res.status(400).json({ error: 'Informe um telefone válido.' });
      }
      if (Object.hasOwn(req.body, 'email')) {
        updates.email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (updates.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
          return res.status(400).json({ error: 'Informe um e-mail válido para o acesso profissional.' });
        }
        if (!await ensureProfessionalEmailAvailable(updates.email, id)) {
          return res.status(409).json({ error: 'Este e-mail já está associado a outra conta.' });
        }
      }
      if (Object.hasOwn(req.body, 'senha')) {
        if (typeof req.body.senha !== 'string' || req.body.senha.length < 6) {
          return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }
        updates.senha_hash = await bcrypt.hash(req.body.senha, 10);
      }
      if (Object.hasOwn(req.body, 'ativo')) {
        if (!validActive(req.body.ativo)) return res.status(400).json({ error: 'O status ativo deve ser verdadeiro ou falso.' });
        updates.ativo = req.body.ativo;
      }
      const hasServiceList = Object.hasOwn(req.body, 'ids_servico');
      const servicos = req.body.ids_servico;
      if (hasServiceList && (!Array.isArray(servicos) || servicos.some(serviceId => !positiveInteger(serviceId)))) {
        return res.status(400).json({ error: 'A lista de serviços da profissional é inválida.' });
      }
      if (!Object.keys(updates).length && !hasServiceList) return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
      const uniqueServices = [...new Set((servicos || []).map(Number))];
      if (hasServiceList && uniqueServices.length) {
        const existingServices = await db('SERVICO').whereIn('id_servico', uniqueServices).pluck('id_servico');
        if (existingServices.length !== uniqueServices.length) {
          return res.status(400).json({ error: 'Um ou mais serviços selecionados não existem.' });
        }
      }
      const changed = await db.transaction(async trx => {
        const updated = Object.keys(updates).length
          ? await trx('PROFISSIONAL').where('id_professional', id).update(updates)
          : await trx('PROFISSIONAL').where('id_professional', id).first();
        if (!updated) return 0;
        if (hasServiceList) {
          await trx('PROFISSIONAL_SERVICO').where('id_profissional', id).del();
          if (uniqueServices.length) {
            await trx('PROFISSIONAL_SERVICO').insert(uniqueServices.map(id_servico => ({ id_profissional: id, id_servico })));
          }
        }
        return 1;
      });
      return changed ? res.json({ message: 'Profissional atualizado com sucesso.' }) : res.status(404).json({ error: 'Profissional não encontrado.' });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Este e-mail já está associado a outra conta.' });
      }
      return erroInterno(res, error);
    }
  },

  async createCategory(req, res) {
    try {
      const nome_categoria = optionalText(req.body.nome_categoria);
      if (!nome_categoria) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
      await db('CATEGORIA_SERVICO').insert({ nome_categoria });
      return res.status(201).json({ message: 'Categoria criada com sucesso.' });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
      }
      return erroInterno(res, error);
    }
  },

  async updateCategory(req, res) {
    try {
      const id = positiveInteger(req.params.id);
      const nome_categoria = optionalText(req.body.nome_categoria);
      if (!id || !nome_categoria) return res.status(400).json({ error: 'Informe uma categoria e um nome válidos.' });
      const changed = await db('CATEGORIA_SERVICO').where('id_categoria', id).update({ nome_categoria });
      return changed ? res.json({ message: 'Categoria atualizada com sucesso.' }) : res.status(404).json({ error: 'Categoria não encontrada.' });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
      }
      return erroInterno(res, error);
    }
  },

  async createService(req, res) {
    let uploadedPath;
    try {
      const id_categoria = positiveInteger(req.body.id_categoria);
      const nome_servico = optionalText(req.body.nome_servico);
      const preco = Number(req.body.preco);
      const duracao_minutos = Number(req.body.duracao_minutos);
      const descricao = optionalText(req.body.descricao);
      const extension = req.file ? uploadedImageExtension(req.file) : null;
      let imagem_url = req.file ? null : optionalImageUrl(req.body.imagem_url);
      if (!id_categoria || !nome_servico || !Number.isFinite(preco) || preco < 0 ||
          !Number.isInteger(duracao_minutos) || duracao_minutos < 1 ||
          descricao === undefined || imagem_url === undefined || req.file && !extension) {
        return res.status(400).json({ error: 'Confira categoria, nome, preço, duração, descrição e imagem.' });
      }
      if (!await ensureCategory(id_categoria)) return res.status(400).json({ error: 'A categoria selecionada não existe.' });
      if (req.file) {
        const savedImage = await saveUploadedImage(req.file, extension);
        uploadedPath = savedImage.filePath;
        imagem_url = savedImage.url;
      }
      await db('SERVICO').insert({
        id_categoria, nome_servico, preco, duracao_minutos, descricao, imagem_url, ativo: true
      });
      return res.status(201).json({ message: 'Serviço cadastrado com sucesso.' });
    } catch (error) {
      if (uploadedPath) {
        try {
          await fs.rm(uploadedPath, { force: true });
        } catch (cleanupError) {
          console.error('[SISAGEND] Não foi possível remover a imagem de serviço não cadastrada:', cleanupError);
        }
      }
      return erroInterno(res, error);
    }
  },

  async updateService(req, res) {
    let uploadedPath;
    try {
      const id = positiveInteger(req.params.id);
      const updates = {};
      const imageExtension = req.file ? uploadedImageExtension(req.file) : null;
      if (!id) return res.status(400).json({ error: 'Serviço inválido.' });
      if (req.file && !imageExtension) return res.status(400).json({ error: 'O arquivo enviado não é uma imagem válida.' });
      if (Object.hasOwn(req.body, 'id_categoria')) {
        updates.id_categoria = positiveInteger(req.body.id_categoria);
        if (!updates.id_categoria || !await ensureCategory(updates.id_categoria)) {
          return res.status(400).json({ error: 'A categoria selecionada não existe.' });
        }
      }
      if (Object.hasOwn(req.body, 'nome_servico')) {
        updates.nome_servico = optionalText(req.body.nome_servico);
        if (!updates.nome_servico) return res.status(400).json({ error: 'Informe um nome de serviço válido.' });
      }
      if (Object.hasOwn(req.body, 'preco')) {
        updates.preco = Number(req.body.preco);
        if (!Number.isFinite(updates.preco) || updates.preco < 0) return res.status(400).json({ error: 'Informe um preço igual ou maior que zero.' });
      }
      if (Object.hasOwn(req.body, 'duracao_minutos')) {
        updates.duracao_minutos = Number(req.body.duracao_minutos);
        if (!Number.isInteger(updates.duracao_minutos) || updates.duracao_minutos < 1) {
          return res.status(400).json({ error: 'Informe a duração em minutos.' });
        }
      }
      if (Object.hasOwn(req.body, 'descricao')) {
        updates.descricao = optionalText(req.body.descricao);
        if (updates.descricao === undefined) return res.status(400).json({ error: 'Informe uma descrição válida.' });
      }
      if (!req.file && Object.hasOwn(req.body, 'imagem_url')) {
        updates.imagem_url = optionalImageUrl(req.body.imagem_url);
        if (updates.imagem_url === undefined) return res.status(400).json({ error: 'Informe uma URL http(s) ou caminho local de imagem válido.' });
      }
      if (Object.hasOwn(req.body, 'ativo')) {
        if (!validActive(req.body.ativo)) return res.status(400).json({ error: 'O status ativo deve ser verdadeiro ou falso.' });
        updates.ativo = req.body.ativo;
      }
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
      if (req.file) {
        const savedImage = await saveUploadedImage(req.file, imageExtension);
        updates.imagem_url = savedImage.url;
        uploadedPath = savedImage.filePath;
      }
      const changed = await db('SERVICO').where('id_servico', id).update(updates);
      if (!changed && uploadedPath) await fs.rm(uploadedPath, { force: true });
      return changed ? res.json({ message: 'Serviço atualizado com sucesso.' }) : res.status(404).json({ error: 'Serviço não encontrado.' });
    } catch (error) {
      if (uploadedPath) {
        try {
          await fs.rm(uploadedPath, { force: true });
        } catch (cleanupError) {
          console.error('[SISAGEND] Não foi possível remover a imagem de serviço não atualizada:', cleanupError);
        }
      }
      return erroInterno(res, error);
    }
  }
};

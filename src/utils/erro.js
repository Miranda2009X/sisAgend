module.exports = function erroInterno(res, error) {
  console.error('[SISAGEND] Erro:', error);
  return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
};

module.exports = function erroInterno(res, error) {
  // Registra o detalhe no servidor sem expor informações internas ao cliente.
  console.error('[SISAGEND] Erro:', error);
  return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
};

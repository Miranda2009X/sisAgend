// Registra o erro real no terminal do servidor e devolve uma mensagem
// genérica ao navegador, sem expor detalhes internos (SQL, caminhos, etc.).
module.exports = function erroInterno(res, error) {
  console.error('[SISAGEND] Erro:', error);
  return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
};

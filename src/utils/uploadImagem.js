// Valida e recebe uploads de imagens com limite de tamanho e quantidade.
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Escolha uma imagem JPG, PNG, WebP ou GIF.'));
    }
    return callback(null, true);
  }
});

module.exports = function uploadImagem(req, res, next) {
  upload.single('imagem')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A imagem deve ter no máximo 5 MB.' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Não foi possível processar o arquivo enviado.' });
    }
    return res.status(400).json({ error: error.message });
  });
};

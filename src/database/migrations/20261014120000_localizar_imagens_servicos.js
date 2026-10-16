// Atualiza créditos remotos para imagens mantidas localmente no site.
const imagePaths = [
  {
    remoteUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Fine_Braids%2C_Dimma_%2813307706094%29.jpg',
    localPath: '/imagens/trancas-referencia.jpg'
  },
  {
    remoteUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Hair_Oil_Treatment_at_Hair_Salon.jpg/960px-Hair_Oil_Treatment_at_Hair_Salon.jpg',
    localPath: '/imagens/tratamento-capilar.jpg'
  }
];

exports.up = async function(knex) {
  for (const { remoteUrl, localPath } of imagePaths) {
    await knex('SERVICO').where('imagem_url', remoteUrl).update({ imagem_url: localPath });
  }
};

exports.down = async function(knex) {
  for (const { remoteUrl, localPath } of imagePaths) {
    await knex('SERVICO').where('imagem_url', localPath).update({ imagem_url: remoteUrl });
  }
};
// Substitui referências antigas de tranças pela imagem própria enviada pelo salão.
const previousImages = [
  '/imagens/box-braids.jpg',
  '/imagens/trancas-referencia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/6/66/Fine_Braids%2C_Dimma_%2813307706094%29.jpg'
];
const customImage = '/imagens/trancas-salao.jpg';

exports.up = async function(knex) {
  await knex('SERVICO').whereIn('imagem_url', previousImages).update({ imagem_url: customImage });
};

exports.down = async function(knex) {
  await knex('SERVICO').where('imagem_url', customImage).update({ imagem_url: previousImages[0] });
};

// Substitui referências antigas de hidratação pela imagem própria enviada pelo salão.
const previousImages = [
  '/imagens/tratamento-capilar.jpg',
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Hair_Oil_Treatment_at_Hair_Salon.jpg/960px-Hair_Oil_Treatment_at_Hair_Salon.jpg'
];
const customImage = '/imagens/hidratacao.avif';

exports.up = async function(knex) {
  await knex('SERVICO').whereIn('imagem_url', previousImages).update({ imagem_url: customImage });
};

exports.down = async function(knex) {
  await knex('SERVICO').where('imagem_url', customImage).update({ imagem_url: previousImages[0] });
};

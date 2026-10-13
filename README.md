# SISAGEND

Sistema de agendamento para o salão Berenice Braids.

- **Backend:** Node.js + Express 5 + Knex + SQLite
- **Front-end:** HTML/CSS/JS puro em `htmlTrabalho/`, servido pelo próprio Express

## Como executar

```bash
npm install
npm start
```

O servidor aplica as migrações pendentes antes de começar a aceitar requisições. Também é possível executá-las manualmente com `npx knex migrate:latest`.

Abra http://localhost:3001

## Acesso administrativo

A tela de profissionais, o catálogo administrativo e as operações de gerenciamento exigem autenticação administrativa. Configure no arquivo `.env`:

```env
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD_HASH=hash-bcrypt-da-senha
JWT_SECRET=use-um-segredo-aleatorio-com-pelo-menos-32-caracteres
```

Gere o hash da senha administrativa com `node -e "require('bcrypt').hash(process.argv[1], 12).then(console.log)" "sua-senha-forte"` e o segredo com `openssl rand -hex 32`. `ADMIN_PASSWORD` sem hash ainda é aceito para compatibilidade, mas o recomendado é configurar `ADMIN_PASSWORD_HASH`. Acesse `/admin.html` para entrar; a administração inclui `/profissionais.html`, `/catalogo-admin.html`, `/clientes-admin.html` e `/relatorios.html`. Clientes podem criar uma conta ou entrar em `/cadastro.html`; o agendamento e a consulta das próprias reservas exigem sessão de cliente.

O banco padrão fica em `src/database/database.sqlite`. Defina `SISAGEND_DB_PATH` para usar outro arquivo SQLite. Para aplicar as migrações pendentes a um banco existente, preservando os dados:

```bash
npx knex migrate:latest
```

## Rotas principais

| Método | Rota                          | Função                                   |
| ------ | ----------------------------- | ---------------------------------------- |
| POST   | `/clientes`                   | Cadastra cliente (senha com bcrypt)      |
| POST   | `/login`                      | Autentica cliente por e-mail e senha     |
| GET/PUT | `/clientes/me`                | Consulta e atualiza a própria conta      |
| GET    | `/clientes`                   | Lista clientes ativos (somente administração) |
| PUT/DELETE | `/clientes/:id`             | Atualiza ou desativa cliente (admin)     |
| GET    | `/agendamentos/me`            | Lista reservas da conta autenticada      |
| GET    | `/agendamentos/disponibilidade` | Retorna somente horários livres (cliente) |
| PUT    | `/agendamentos/me/:id/cancelar` | Cancela reserva própria com justificativa |
| PUT    | `/agendamentos/me/:id/reagendar` | Remarca reserva própria e revalida conflitos |
| GET    | `/admin/catalogo`             | Lista o catálogo para administração      |
| GET    | `/admin/relatorios?inicio=&fim=` | Atendimentos e faturamento por período (admin) |
| POST/PUT | `/categorias`               | Cria ou atualiza categorias (admin)      |
| POST/PUT | `/profissionais`            | Cria ou atualiza profissionais (admin)   |
| POST/PUT | `/servicos`                  | Cria ou atualiza serviços (admin)        |
| GET    | `/profissionais/escala`       | Escala diária (`data=AAAA-MM-DD`), semanal (`inicio`/`fim`) ou mensal (`mes=AAAA-MM`) |
| GET    | `/servicos`                   | Lista serviços ativos                    |
| POST   | `/agendamentos`               | Cria reserva para o cliente autenticado  |
| PUT    | `/agendamentos/:id/status`    | Muda status (admin; cancelar exige justificativa) |
| PUT    | `/agendamentos/:id/reagendar` | Remarca (admin; revalida conflito)       |

## Regras de negócio

- Horários só em hora inteira e a partir de agora.
- Atendimentos ocorrem entre 08:00 e 18:00; o horário de término não pode ultrapassar o expediente.
- Um profissional não pode ter dois agendamentos sobrepostos (cancelados não contam).
- O horário de término é calculado pela duração do serviço.
- Cancelar exige justificativa.
- Clientes recebem somente horários disponíveis, não os intervalos ou os dados de outras reservas.
- Desativar um cliente remove suas credenciais e dados pessoais, preservando o vínculo das reservas históricas.
- O faturamento considera somente atendimentos concluídos e o preço registrado no agendamento; reservas antigas recebem o preço atual na migração inicial.

## Testes

Execute `npm test`. Os testes de integração usam um banco SQLite temporário e não alteram o banco de desenvolvimento.

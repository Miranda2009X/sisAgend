# SISAGEND

Sistema de agendamento para o salão Berenice Braids.

- **Backend:** Node.js + Express 5 + Knex + SQLite
- **Front-end:** HTML/CSS/JS puro em `htmlTrabalho/`, servido pelo próprio Express

## Como executar

```bash
npm install
npm start
```

Abra http://localhost:3001

## Acesso administrativo

A tela de profissionais, o catálogo administrativo e as operações de gerenciamento exigem autenticação administrativa. Configure no arquivo `.env`:

```env
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=defina-uma-senha-forte
JWT_SECRET=use-um-segredo-aleatorio-com-pelo-menos-32-caracteres
```

Gere o segredo com `openssl rand -hex 32`. Acesse `/admin.html` para entrar e `/catalogo-admin.html` para gerenciar profissionais, categorias e serviços. Clientes podem criar uma conta ou entrar em `/cadastro.html`; o agendamento e a consulta das próprias reservas exigem sessão de cliente.

O banco fica em `src/database/database.sqlite`. Para aplicar as migrações pendentes a um banco existente, preservando os dados:

```bash
npx knex migrate:latest
```

## Rotas principais

| Método | Rota                          | Função                                   |
| ------ | ----------------------------- | ---------------------------------------- |
| POST   | `/clientes`                   | Cadastra cliente (senha com bcrypt)      |
| POST   | `/login`                      | Autentica cliente por e-mail e senha     |
| GET    | `/clientes/me`                | Consulta a conta autenticada             |
| GET    | `/clientes`                   | Lista clientes (somente administração)   |
| GET    | `/agendamentos/me`            | Lista reservas da conta autenticada      |
| GET    | `/admin/catalogo`             | Lista o catálogo para administração      |
| POST/PUT | `/categorias`               | Cria ou atualiza categorias (admin)      |
| POST/PUT | `/profissionais`            | Cria ou atualiza profissionais (admin)   |
| POST/PUT | `/servicos`                  | Cria ou atualiza serviços (admin)        |
| GET    | `/profissionais/escala`       | Escala diária (`data=AAAA-MM-DD`) ou mensal (`mes=AAAA-MM`) |
| GET    | `/servicos`                   | Lista serviços ativos                    |
| POST   | `/agendamentos`               | Cria reserva para o cliente autenticado  |
| PUT    | `/agendamentos/:id/status`    | Muda status (admin; cancelar exige justificativa) |
| PUT    | `/agendamentos/:id/reagendar` | Remarca (admin; revalida conflito)       |

## Regras de negócio

- Horários só em hora inteira e a partir de agora.
- Um profissional não pode ter dois agendamentos sobrepostos (cancelados não contam).
- O horário de término é calculado pela duração do serviço.
- Cancelar exige justificativa.

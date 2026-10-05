# SISAGEND

Sistema de agendamento para o salão NatiBraids.

- **Backend:** Node.js + Express 5 + Knex + SQLite
- **Front-end:** HTML/CSS/JS puro em `htmlTrabalho/`, servido pelo próprio Express

## Como executar

```bash
npm install
npm start
```

Abra http://localhost:3001

O banco fica em `src/database/database.sqlite`. Para recriá-lo do zero:

```bash
npx knex migrate:latest
```

## Rotas principais

| Método | Rota                          | Função                                   |
| ------ | ----------------------------- | ---------------------------------------- |
| POST   | `/clientes`                   | Cadastra cliente (senha com bcrypt)      |
| POST   | `/login`                      | Autentica cliente por e-mail e senha     |
| GET    | `/clientes`                   | Lista clientes                           |
| POST   | `/profissionais`              | Cadastra profissional                    |
| GET    | `/profissionais/escala`       | Escala do dia com agendamentos           |
| GET    | `/servicos`                   | Lista serviços ativos                    |
| POST   | `/agendamentos`               | Cria agendamento (valida conflito)       |
| PUT    | `/agendamentos/:id/status`    | Muda status (cancelar exige justificativa) |
| PUT    | `/agendamentos/:id/reagendar` | Remarca (revalida horário e conflito)    |

## Regras de negócio

- Horários só em hora inteira e a partir de agora.
- Um profissional não pode ter dois agendamentos sobrepostos (cancelados não contam).
- O horário de término é calculado pela duração do serviço.
- Cancelar exige justificativa.

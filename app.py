import os
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS


BASE_DIR = Path(__file__).resolve().parent
DATABASE = Path(os.getenv("DATABASE_PATH", BASE_DIR / "src" / "database" / "database.sqlite"))

app = Flask(__name__)
CORS(app)


def get_db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS CLIENTE (
                id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS PROFISSIONAL (
                id_professional INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL,
                ativo INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS CATEGORIA_SERVICO (
                id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_categoria TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS SERVICO (
                id_servico INTEGER PRIMARY KEY AUTOINCREMENT,
                id_categoria INTEGER NOT NULL,
                nome_servico TEXT NOT NULL,
                preco NUMERIC NOT NULL,
                duracao_minutos INTEGER NOT NULL,
                ativo INTEGER DEFAULT 1,
                FOREIGN KEY (id_categoria) REFERENCES CATEGORIA_SERVICO (id_categoria)
            );
            CREATE TABLE IF NOT EXISTS AGENDAMENTO (
                id_agendamento INTEGER PRIMARY KEY AUTOINCREMENT,
                id_cliente INTEGER NOT NULL,
                id_profissional INTEGER NOT NULL,
                id_servico INTEGER NOT NULL,
                data_hora_inicio TIMESTAMP NOT NULL,
                data_hora_fim TIMESTAMP NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pendente',
                FOREIGN KEY (id_cliente) REFERENCES CLIENTE (id_cliente),
                FOREIGN KEY (id_profissional) REFERENCES PROFISSIONAL (id_professional),
                FOREIGN KEY (id_servico) REFERENCES SERVICO (id_servico)
            );
            """
        )


def body_fields(*fields):
    data = request.get_json(silent=True) or {}
    missing = [field for field in fields if not data.get(field)]
    return data, missing


def rows_as_dict(rows):
    return [dict(row) for row in rows]


@app.post("/clientes")
def criar_cliente():
    data, missing = body_fields("nome", "telefone", "email", "senha_hash")
    if missing:
        return jsonify(error="Preencha todos os campos obrigatórios."), 400
    try:
        with get_db() as connection:
            connection.execute(
                "INSERT INTO CLIENTE (nome, telefone, email, senha_hash) VALUES (?, ?, ?, ?)",
                (data["nome"], data["telefone"], data["email"], data["senha_hash"]),
            )
        return jsonify(message="Cliente cadastrado com sucesso!"), 201
    except sqlite3.IntegrityError as error:
        return jsonify(error=str(error)), 500


@app.get("/clientes")
def listar_clientes():
    with get_db() as connection:
        rows = connection.execute(
            "SELECT id_cliente, nome, telefone, email, data_cadastro FROM CLIENTE"
        ).fetchall()
    return jsonify(rows_as_dict(rows))


@app.post("/profissionais")
def criar_profissional():
    data, missing = body_fields("nome", "telefone")
    if missing:
        return jsonify(error="Nome e telefone são obrigatórios."), 400
    with get_db() as connection:
        connection.execute(
            "INSERT INTO PROFISSIONAL (nome, telefone, ativo) VALUES (?, ?, 1)",
            (data["nome"], data["telefone"]),
        )
    return jsonify(message="Profissional cadastrado com sucesso!"), 201


@app.post("/categorias")
def criar_categoria():
    data, missing = body_fields("nome_categoria")
    if missing:
        return jsonify(error="Nome da categoria é obrigatório."), 400
    try:
        with get_db() as connection:
            connection.execute(
                "INSERT INTO CATEGORIA_SERVICO (nome_categoria) VALUES (?)",
                (data["nome_categoria"],),
            )
        return jsonify(message="Categoria criada com sucesso!"), 201
    except sqlite3.IntegrityError as error:
        return jsonify(error=str(error)), 500


@app.post("/servicos")
def criar_servico():
    data, missing = body_fields("id_categoria", "nome_servico", "preco", "duracao_minutos")
    if missing:
        return jsonify(error="Preencha todos os campos."), 400
    with get_db() as connection:
        connection.execute(
            """INSERT INTO SERVICO
               (id_categoria, nome_servico, preco, duracao_minutos, ativo)
               VALUES (?, ?, ?, ?, 1)""",
            (data["id_categoria"], data["nome_servico"], data["preco"], data["duracao_minutos"]),
        )
    return jsonify(message="Serviço cadastrado com sucesso!"), 201


@app.get("/servicos")
def listar_servicos():
    with get_db() as connection:
        rows = connection.execute(
            """SELECT SERVICO.*, CATEGORIA_SERVICO.nome_categoria
               FROM SERVICO
               JOIN CATEGORIA_SERVICO ON SERVICO.id_categoria = CATEGORIA_SERVICO.id_categoria
               WHERE SERVICO.ativo = 1"""
        ).fetchall()
    return jsonify(rows_as_dict(rows))


@app.post("/agendamentos")
def criar_agendamento():
    fields = ("id_cliente", "id_profissional", "id_servico", "data_hora_inicio", "data_hora_fim")
    data, missing = body_fields(*fields)
    if missing:
        return jsonify(error="Todos os campos do agendamento são obrigatórios."), 400

    with get_db() as connection:
        conflict = connection.execute(
            """SELECT 1 FROM AGENDAMENTO
               WHERE id_profissional = ? AND status != 'Cancelado'
                 AND data_hora_inicio < ? AND data_hora_fim > ? LIMIT 1""",
            (data["id_profissional"], data["data_hora_fim"], data["data_hora_inicio"]),
        ).fetchone()
        if conflict:
            return jsonify(error="Este profissional já possui um agendamento neste horário."), 400
        connection.execute(
            """INSERT INTO AGENDAMENTO
               (id_cliente, id_profissional, id_servico, data_hora_inicio, data_hora_fim, status)
               VALUES (?, ?, ?, ?, ?, 'Pendente')""",
            tuple(data[field] for field in fields),
        )
    return jsonify(message="Agendamento realizado com sucesso!"), 201


@app.get("/agendamentos")
def listar_agendamentos():
    date = request.args.get("data")
    query = """SELECT AGENDAMENTO.*, CLIENTE.nome AS cliente_nome,
               PROFISSIONAL.nome AS profissional_nome, SERVICO.nome_servico
               FROM AGENDAMENTO
               JOIN CLIENTE ON AGENDAMENTO.id_cliente = CLIENTE.id_cliente
               JOIN PROFISSIONAL ON AGENDAMENTO.id_profissional = PROFISSIONAL.id_professional
               JOIN SERVICO ON AGENDAMENTO.id_servico = SERVICO.id_servico"""
    parameters = []
    if date:
        query += " WHERE AGENDAMENTO.data_hora_inicio LIKE ?"
        parameters.append(f"{date}%")
    with get_db() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return jsonify(rows_as_dict(rows))


@app.put("/agendamentos/<int:appointment_id>/status")
def atualizar_status(appointment_id):
    data, missing = body_fields("status")
    valid_statuses = {"Pendente", "Confirmado", "Concluido", "Cancelado"}
    if missing or data["status"] not in valid_statuses:
        return jsonify(error="Status inválido."), 400
    with get_db() as connection:
        connection.execute(
            "UPDATE AGENDAMENTO SET status = ? WHERE id_agendamento = ?",
            (data["status"], appointment_id),
        )
    return jsonify(message=f"Status do agendamento atualizado para {data['status']}.")


@app.put("/agendamentos/<int:appointment_id>/reagendar")
def reagendar(appointment_id):
    data, missing = body_fields("data_hora_inicio", "data_hora_fim")
    if missing:
        return jsonify(error="As novas datas do agendamento são obrigatórias."), 400
    with get_db() as connection:
        connection.execute(
            "UPDATE AGENDAMENTO SET data_hora_inicio = ?, data_hora_fim = ? WHERE id_agendamento = ?",
            (data["data_hora_inicio"], data["data_hora_fim"], appointment_id),
        )
    return jsonify(message="Agendamento remarcado com sucesso.")


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "3000")), debug=False)

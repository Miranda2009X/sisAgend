# SISAGEND

O servidor principal agora pode ser executado em Python com Flask e SQLite. O backend JavaScript antigo foi mantido para facilitar a transicao.

## Executar em Python

```powershell
uv venv .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
.venv\Scripts\python.exe app.py
```

A API fica disponível em `http://localhost:3000`.

O banco continua em `src/database/database.sqlite`. Para usar outro arquivo, defina `DATABASE_PATH` antes de iniciar o servidor.

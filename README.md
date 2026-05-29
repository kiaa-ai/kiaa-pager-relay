# KIAA Pager - Relay

Pequeno servidor HTTP que liga o relógio (que chega via internet) ao PC (que
está em qualquer rede). Sem dependências, apenas Node.js >= 18.

## Endpoints
- `GET /ping` — healthcheck (sem auth).
- `POST /key` — relógio envia `{action: 'next'|'prev'}` (com header `X-Pager-Token` se autenticação estiver ligada).
- `GET /poll?token=X` — companion long-pola; servidor segura até 25 s ou devolve comando assim que chega.

## Deploy no Render
1. Subir esses arquivos num repo GitHub (público é OK).
2. No painel do Render: **New** → **Web Service** → conectar o repo.
3. Render detecta Node, usa `npm start`. Plano: Free.
4. (Opcional) Em **Environment** → add `PAGER_TOKEN = algum-segredo-seu`. Mesmo valor vai no companion.
5. Após o deploy, anotar a URL: `https://NOME.onrender.com`.
6. No app Zepp do relógio → Configurações do KIAA Pager → colar a URL.
7. No PC, rodar o companion novo (`pager_pc.py`) — ele vai conectar no relay.

## Local (teste rápido)
```bash
PAGER_TOKEN=teste node relay.js
# Testar:
curl http://localhost:3000/ping
```

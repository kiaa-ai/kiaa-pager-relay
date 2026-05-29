// KIAA Pager - Relay
// Recebe comandos do app no relogio (POST /key {action}) e entrega ao
// companion do PC que esta long-polling (GET /poll). Zero dependencias.
//
// Variaveis de ambiente (configurar em Render -> Settings -> Environment):
//   PAGER_TOKEN  - segredo compartilhado entre relogio, companion e relay.
//                  Se vazio, autenticacao desabilitada (uso pessoal, URL secreta).
const http = require('http')

const PORT = process.env.PORT || 3000
const TOKEN = process.env.PAGER_TOKEN || ''

// Fila FIFO de comandos pendentes (recebidos do relogio, aguardando companion).
const queue = []
// Companions esperando comando via long-poll (response objects).
const waiters = []

function dispatch() {
  while (queue.length > 0 && waiters.length > 0) {
    const cmd = queue.shift()
    const res = waiters.shift()
    if (res.timer) clearTimeout(res.timer)
    if (!res.writableEnded) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ action: cmd, ts: Date.now() }))
    }
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pager-Token')
}

function authOk(req, urlObj) {
  if (!TOKEN) return true
  const token = req.headers['x-pager-token'] || urlObj.searchParams.get('token') || ''
  return token === TOKEN
}

const server = http.createServer((req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  const path = urlObj.pathname.replace(/\/+$/, '') || '/'

  // Healthcheck (sem auth) — Render usa pra acordar.
  if (path === '/ping' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, msg: 'pong', queue: queue.length, waiters: waiters.length }))
    return
  }

  if (!authOk(req, urlObj)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'auth' }))
    return
  }

  // Relogio dispara comando.
  if (path === '/key' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk; if (body.length > 1024) req.destroy() })
    req.on('end', () => {
      let action = 'next'
      try {
        const data = JSON.parse(body || '{}')
        if (data && typeof data.action === 'string') action = data.action
      } catch (e) {}
      queue.push(action)
      dispatch()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, queued: queue.length, action }))
    })
    return
  }

  // Companion faz long-poll aqui.
  if (path === '/poll' && req.method === 'GET') {
    // Se ja tem comando na fila, retorna imediato.
    if (queue.length > 0) {
      waiters.push(res)
      dispatch()
      return
    }
    // Senao espera ate 25s (limite de Render pra requests longos eh ~30s).
    waiters.push(res)
    res.timer = setTimeout(() => {
      const i = waiters.indexOf(res)
      if (i !== -1) {
        waiters.splice(i, 1)
        if (!res.writableEnded) {
          res.writeHead(204) // No Content
          res.end()
        }
      }
    }, 25000)
    res.on('close', () => {
      if (res.timer) clearTimeout(res.timer)
      const i = waiters.indexOf(res)
      if (i !== -1) waiters.splice(i, 1)
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'not-found' }))
})

server.listen(PORT, () => {
  console.log(`KIAA Pager relay listening on ${PORT}, auth=${TOKEN ? 'on' : 'off'}`)
})

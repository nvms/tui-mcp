import net from 'net'
import fs from 'fs'
import path from 'path'
import os from 'os'
import * as session from './session.js'

const SOCK_DIR = path.join(os.homedir(), '.tui-mcp')
const SOCK_PATH = path.join(SOCK_DIR, 'sock')

const clients = new Set()

function broadcast(msg) {
  const line = JSON.stringify(msg) + '\n'
  for (const c of clients) {
    try { c.write(line) } catch {}
  }
}

function sendTo(socket, msg) {
  socket.write(JSON.stringify(msg) + '\n')
}

session.events.on('created', (info) => {
  broadcast({ type: 'created', session: info })
})

session.events.on('killed', (sessionId) => {
  broadcast({ type: 'killed', sessionId })
})

session.events.on('exited', (sessionId, exitCode) => {
  broadcast({ type: 'exited', sessionId, exitCode })
})

session.events.on('buffer', (sessionId) => {
  try {
    const ansi = session.ansiSnapshot(sessionId)
    broadcast({ type: 'buffer', sessionId, ansi })
  } catch {}
})

export function startIpc() {
  fs.mkdirSync(SOCK_DIR, { recursive: true })

  try { fs.unlinkSync(SOCK_PATH) } catch {}

  const server = net.createServer((socket) => {
    clients.add(socket)

    const sessions = session.listSessions()
    sendTo(socket, { type: 'sessions', sessions })

    for (const s of sessions) {
      try {
        const ansi = session.ansiSnapshot(s.sessionId)
        sendTo(socket, { type: 'buffer', sessionId: s.sessionId, ansi })
      } catch {}
    }

    socket.on('close', () => clients.delete(socket))
    socket.on('error', () => clients.delete(socket))
  })

  server.listen(SOCK_PATH)

  const cleanup = () => {
    try { fs.unlinkSync(SOCK_PATH) } catch {}
  }

  process.on('exit', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)

  return server
}

import net from 'net'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'
import * as session from './session.js'

export const SOCK_DIR = path.join(os.homedir(), '.tui-mcp')

const pkg = createRequire(import.meta.url)('../package.json')

const clients = new Set()

function broadcast(msg) {
  const line = JSON.stringify(msg) + '\n'
  for (const c of clients) {
    try { c.write(line) } catch {}
  }
}

function sendTo(socket, msg) {
  try { socket.write(JSON.stringify(msg) + '\n') } catch {}
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

session.events.on('reaped', (sessionId) => {
  broadcast({ type: 'killed', sessionId })
})

session.events.on('buffer', async (sessionId) => {
  try {
    await session.settled(sessionId)
    const ansi = session.ansiSnapshot(sessionId)
    broadcast({ type: 'buffer', sessionId, ansi })
  } catch {}
})

const commands = {
  stdin: ({ sessionId, data }) => session.sendText(sessionId, String(data)),
  kill: ({ sessionId }) => session.kill(sessionId),
  resize: ({ sessionId, cols, rows }) => session.resize(sessionId, cols, rows),
  launch: ({ command, cols, rows, cwd }) => session.launch(command, { cols, rows, cwd }),
  scrollback: async ({ sessionId, lines }) => {
    await session.settled(sessionId)
    return { text: session.getScrollback(sessionId, lines) }
  },
}

async function handleCommand(socket, msg) {
  const run = commands[msg.type]
  if (!run) return
  try {
    const data = await run(msg)
    if (msg.reqId) sendTo(socket, { type: 'result', reqId: msg.reqId, ok: true, data })
  } catch (e) {
    if (msg.reqId) sendTo(socket, { type: 'result', reqId: msg.reqId, ok: false, error: e.message })
  }
}

function readLines(socket, onLine) {
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString()
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line) onLine(line)
    }
  })
}

function cleanStaleSockets() {
  let files = []
  try { files = fs.readdirSync(SOCK_DIR).filter(f => f.endsWith('.sock')) } catch { return }
  for (const file of files) {
    const m = file.match(/^(\d+)\.sock$/)
    if (!m) continue
    const pid = Number(m[1])
    try { process.kill(pid, 0) } catch {
      try { fs.unlinkSync(path.join(SOCK_DIR, file)) } catch {}
    }
  }
}

export function startIpc() {
  fs.mkdirSync(SOCK_DIR, { recursive: true })
  cleanStaleSockets()

  const sockPath = path.join(SOCK_DIR, `${process.pid}.sock`)
  try { fs.unlinkSync(sockPath) } catch {}

  const server = net.createServer(async (socket) => {
    clients.add(socket)

    sendTo(socket, { type: 'hello', pid: process.pid, version: pkg.version, caps: ['control'] })

    const sessions = session.listSessions()
    sendTo(socket, { type: 'sessions', sessions })

    readLines(socket, (line) => {
      try { handleCommand(socket, JSON.parse(line)) } catch {}
    })

    socket.on('close', () => clients.delete(socket))
    socket.on('error', () => clients.delete(socket))

    for (const s of sessions) {
      try {
        await session.settled(s.sessionId)
        const ansi = session.ansiSnapshot(s.sessionId)
        sendTo(socket, { type: 'buffer', sessionId: s.sessionId, ansi })
      } catch {}
    }
  })

  server.on('error', (err) => {
    console.error(`[tui-mcp] monitor IPC disabled: ${err.message}`)
  })

  server.listen(sockPath)

  const cleanup = () => {
    try { fs.unlinkSync(sockPath) } catch {}
  }
  server.on('close', cleanup)
  process.on('exit', cleanup)

  server.shutdown = () => new Promise((resolve) => {
    for (const socket of clients) socket.destroy()
    clients.clear()
    server.close(resolve)
  })

  return server
}

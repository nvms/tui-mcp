import net from 'net'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'

const SOCK_DIR = path.join(os.homedir(), '.tui-mcp')
const SCAN_MS = 2000

export function connect() {
  const emitter = new EventEmitter()
  const connections = new Map()
  let destroyed = false

  function scanAndConnect() {
    if (destroyed) return

    let files = []
    try { files = fs.readdirSync(SOCK_DIR).filter(f => f.endsWith('.sock')) } catch {}

    for (const file of files) {
      const sockPath = path.join(SOCK_DIR, file)
      if (connections.has(sockPath)) continue
      connectOne(sockPath)
    }

    setTimeout(scanAndConnect, SCAN_MS)
  }

  function connectOne(sockPath) {
    let buffer = ''
    const socket = net.createConnection(sockPath)
    connections.set(sockPath, socket)

    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let nl
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        try {
          const msg = JSON.parse(line)
          msg._source = sockPath
          emitter.emit('message', msg)
        } catch {}
      }
    })

    socket.on('error', () => {})

    socket.on('close', () => {
      connections.delete(sockPath)
      emitter.emit('server_lost', sockPath)
    })

    socket.on('connect', () => {
      emitter.emit('connected', sockPath)
    })
  }

  scanAndConnect()

  emitter.destroy = () => {
    destroyed = true
    for (const socket of connections.values()) {
      try { socket.destroy() } catch {}
    }
    connections.clear()
  }

  return emitter
}

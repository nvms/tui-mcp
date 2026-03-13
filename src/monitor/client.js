import net from 'net'
import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'

const SOCK_PATH = path.join(os.homedir(), '.tui-mcp', 'sock')

export function connect() {
  const emitter = new EventEmitter()
  let buffer = ''

  const socket = net.createConnection(SOCK_PATH)

  socket.on('data', (chunk) => {
    buffer += chunk.toString()
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      try {
        emitter.emit('message', JSON.parse(line))
      } catch {}
    }
  })

  socket.on('error', (err) => emitter.emit('error', err))
  socket.on('close', () => emitter.emit('close'))

  return emitter
}

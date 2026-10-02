import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import path from 'node:path'
import xterm from '@xterm/headless'
import * as session from '../src/session.js'
import { startIpc, SOCK_DIR } from '../src/ipc.js'

function connect(t) {
  const socket = net.createConnection(path.join(SOCK_DIR, `${process.pid}.sock`))
  t.after(() => socket.destroy())
  const messages = []
  const waiters = []
  let buffer = ''
  socket.on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      messages.push(message)
      for (const waiter of waiters) {
        if (waiter.matches(message)) waiter.resolve(message)
      }
    }
  })
  return {
    socket,
    next(matches) {
      const found = messages.find(matches)
      if (found) return Promise.resolve(found)
      return new Promise(resolve => waiters.push({ matches, resolve }))
    },
  }
}

// Hold the parser's completion callback: no monitor read may escape before
// that callback runs, even when the visible text already looks up to date.
function holdParser(t) {
  const write = xterm.Terminal.prototype.write
  const getBuffer = Object.getOwnPropertyDescriptor(xterm.Terminal.prototype, 'buffer').get
  let released = false
  let earlyReads = 0
  t.mock.getter(xterm.Terminal.prototype, 'buffer', function () {
    if (!released) earlyReads++
    return getBuffer.call(this)
  })
  let entered
  const waiting = new Promise(resolve => { entered = resolve })
  const pending = []
  t.mock.method(xterm.Terminal.prototype, 'write', function (data, callback) {
    if (data === '' && callback) {
      pending.push(() => write.call(this, data, callback))
      entered()
    } else {
      write.call(this, data, callback)
    }
  })
  return {
    waiting,
    earlyReads: () => earlyReads,
    release() {
      released = true
      pending.splice(0).forEach(run => run())
    },
  }
}

for (const read of ['broadcast', 'initial snapshot', 'scrollback']) {
  test(`monitor ${read} waits for the parser`, { timeout: 5000 }, async t => {
    const { sessionId } = await session.launch('sleep 30')
    t.after(() => session.kill(sessionId))
    const server = startIpc()
    await new Promise(resolve => server.once('listening', resolve))
    t.after(() => server.shutdown())

    let client
    if (read !== 'initial snapshot') {
      client = connect(t)
      await client.next(m => m.type === 'buffer' && m.sessionId === sessionId)
    }
    const parser = holdParser(t)
    t.after(() => parser.release())
    let response
    if (read === 'initial snapshot') {
      client = connect(t)
      response = client.next(m => m.type === 'buffer' && m.sessionId === sessionId)
    } else if (read === 'broadcast') {
      // Initial snapshot was consumed before the parser was held; the next
      // socket message belongs to this broadcast.
      const received = new Promise(resolve => client.socket.once('data', resolve))
      session.events.emit('buffer', sessionId)
      response = received
    } else {
      client.socket.write(JSON.stringify({ type: 'scrollback', sessionId, reqId: 1 }) + '\n')
      response = client.next(m => m.type === 'result' && m.reqId === 1)
    }
    const first = await Promise.race([
      parser.waiting.then(() => 'parser'),
      response.then(() => 'read'),
    ])
    assert.equal(first, 'parser', 'monitor read escaped before parser barrier')
    parser.release()
    await response
    assert.equal(parser.earlyReads(), 0, 'monitor accessed the buffer before parser completion')
  })
}

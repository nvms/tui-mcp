import pty from 'node-pty'
const { spawn } = pty
import xterm from '@xterm/headless'
const { Terminal } = xterm
import { renderToPng, renderToText, renderToAnsi, renderScrollback, readRegion } from './renderer.js'
import { resolveKeys, buildMouseSequence } from './keys.js'
import { EventEmitter } from 'events'

export const events = new EventEmitter()

let nextId = 1
const sessions = new Map()
const INTERACTIVE_SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'ksh'])

function disposePty(s) {
  try { s.pty.destroy() } catch {
    try { s.pty.kill() } catch {}
  }
}

function dispose(s) {
  if (s._bufferTimer) {
    clearTimeout(s._bufferTimer)
    s._bufferTimer = null
  }
  if (s._reapTimer) {
    clearTimeout(s._reapTimer)
    s._reapTimer = null
  }
  disposePty(s)
  try { s.term.dispose() } catch {}
}

function killAll() {
  for (const s of sessions.values()) dispose(s)
  sessions.clear()
}

process.on('SIGTERM', () => { killAll(); process.exit(143) })
process.on('SIGINT', () => { killAll(); process.exit(130) })
process.on('SIGHUP', () => { killAll(); process.exit(129) })
process.on('exit', killAll)

const REAP_DELAY = 5 * 60 * 1000
const RAW_HEAD_CAP = 64 * 1024
const RAW_TAIL_CAP = 256 * 1024

function shellSplit(command) {
  if (typeof command !== 'string') return [...command]

  const needsShell = /["'\\|&;<>()$`{}\[\]*?~!]/.test(command)
  if (needsShell) return ['sh', '-c', command]

  const parts = command.split(/\s+/).filter(Boolean)
  return parts.length ? parts : ['sh', '-c', command]
}

export function launch(command, { cols = 80, rows = 24, cwd, env } = {}) {
  const args = shellSplit(command)
  const cmd = args.shift()
  if (cmd && args.length === 0 && INTERACTIVE_SHELLS.has(cmd)) args.push('-i')

  const term = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true })

  const p = spawn(cmd, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...env },
  })

  const id = String(nextId++)
  const created = Date.now()
  const session = {
    id,
    command,
    pid: p.pid,
    pty: p,
    term,
    cols,
    rows,
    exited: false,
    exitCode: null,
    rawHead: '',
    rawTail: '',
    rawBytes: 0,
    _bufferTimer: null,
    _reapTimer: null,
  }

  p.onData((data) => {
    term.write(data)

    session.rawBytes += data.length
    if (session.rawHead.length < RAW_HEAD_CAP) {
      session.rawHead += data.slice(0, RAW_HEAD_CAP - session.rawHead.length)
    }
    session.rawTail += data
    if (session.rawTail.length > RAW_TAIL_CAP) {
      session.rawTail = session.rawTail.slice(session.rawTail.length - RAW_TAIL_CAP)
    }

    if (!session._bufferTimer) {
      session._bufferTimer = setTimeout(() => {
        session._bufferTimer = null
        events.emit('buffer', session.id)
      }, 150)
    }
  })

  p.onExit(({ exitCode, signal }) => {
    const age = Date.now() - created
    console.error(`[tui-mcp] session ${id} exited: code=${exitCode} signal=${signal} age=${age}ms`)
    session.exited = true
    session.exitCode = exitCode
    if (session._bufferTimer) {
      clearTimeout(session._bufferTimer)
      session._bufferTimer = null
    }
    disposePty(session)
    events.emit('exited', session.id, exitCode)

    // xterm parses writes async, so give the final chunk a beat before snapshotting
    setTimeout(() => {
      if (sessions.has(id)) events.emit('buffer', session.id)
    }, 200).unref?.()

    session._reapTimer = setTimeout(() => {
      if (sessions.has(id) && session.exited) {
        dispose(session)
        sessions.delete(id)
        events.emit('reaped', id)
      }
    }, REAP_DELAY)
    session._reapTimer.unref?.()
  })

  sessions.set(id, session)
  events.emit('created', sessionInfo(session))

  return new Promise((resolve) => {
    const settle = () => {
      if (session.exited) {
        resolve({
          sessionId: id,
          pid: p.pid,
          exited: true,
          exitCode: session.exitCode,
        })
      } else {
        resolve({ sessionId: id, pid: p.pid })
      }
    }
    setTimeout(settle, 100)
  })
}

function get(sessionId) {
  const s = sessions.get(sessionId)
  if (!s) throw new Error(`no session with id "${sessionId}"`)
  return s
}

function getRunning(sessionId) {
  const s = get(sessionId)
  if (s.exited) throw new Error(`session "${sessionId}" has already exited (code=${s.exitCode})`)
  return s
}

function sessionInfo(s) {
  return {
    sessionId: s.id,
    command: s.command,
    pid: s.pid,
    cols: s.cols,
    rows: s.rows,
    exited: s.exited,
    exitCode: s.exitCode,
  }
}

export function listSessions() {
  return [...sessions.values()].map(sessionInfo)
}

export function status(sessionId) {
  return sessionInfo(get(sessionId))
}

export function kill(sessionId) {
  const s = get(sessionId)
  dispose(s)
  sessions.delete(sessionId)
  events.emit('killed', sessionId)
}

export function resize(sessionId, cols, rows) {
  const s = getRunning(sessionId)
  s.pty.resize(cols, rows)
  s.term.resize(cols, rows)
  s.cols = cols
  s.rows = rows
}

export async function screenshot(sessionId) {
  const s = get(sessionId)
  return renderToPng(s.term)
}

export function snapshot(sessionId) {
  const s = get(sessionId)
  return renderToText(s.term)
}

export function ansiSnapshot(sessionId) {
  const s = get(sessionId)
  return renderToAnsi(s.term)
}

export function getRegion(sessionId, row, col, width, height) {
  const s = get(sessionId)
  return readRegion(s.term, row, col, width, height)
}

export function getScrollback(sessionId, lines) {
  const s = get(sessionId)
  return renderScrollback(s.term, lines)
}

export function getRawOutput(sessionId, { part = 'tail', limit = 10000 } = {}) {
  const s = get(sessionId)
  const source = part === 'head' ? s.rawHead : s.rawTail
  const text = part === 'head' ? source.slice(0, limit) : source.slice(-limit)
  return {
    part,
    text,
    totalBytes: s.rawBytes,
    headCapped: s.rawBytes > s.rawHead.length,
    tailCapped: s.rawBytes > s.rawTail.length,
  }
}

export function getCursor(sessionId) {
  const s = get(sessionId)
  const buf = s.term.buffer.active
  return { row: buf.cursorY, col: buf.cursorX }
}

export function sendKeys(sessionId, keys) {
  const s = getRunning(sessionId)
  const seq = resolveKeys(keys)
  s.pty.write(seq)
}

export function sendText(sessionId, text) {
  const s = getRunning(sessionId)
  s.pty.write(text)
}

export function sendMouse(sessionId, action, x, y, button) {
  const s = getRunning(sessionId)
  const seq = buildMouseSequence(action, x, y, button)
  if (seq) s.pty.write(seq)
}

export function waitForText(sessionId, pattern, timeout = 5000) {
  const s = getRunning(sessionId)
  const regex = new RegExp(pattern)

  return new Promise((resolve, reject) => {
    const check = () => {
      if (s.exited) {
        clearTimeout(timer)
        clearInterval(interval)
        reject(new Error(`session "${sessionId}" exited before matching "${pattern}"`))
        return
      }

      const text = renderToText(s.term)
      if (regex.test(text)) {
        clearTimeout(timer)
        clearInterval(interval)
        resolve(true)
      }
    }

    const interval = setInterval(check, 50)
    const timer = setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`timed out waiting for "${pattern}" after ${timeout}ms`))
    }, timeout)

    check()
  })
}

export function waitForIdle(sessionId, timeout = 3000, debounce = 300) {
  const s = getRunning(sessionId)

  return new Promise((resolve, reject) => {
    let lastChange = Date.now()
    let lastSnapshot = renderToText(s.term)

    const interval = setInterval(() => {
      if (s.exited) {
        clearInterval(interval)
        clearTimeout(timer)
        reject(new Error(`session "${sessionId}" exited before becoming idle`))
        return
      }

      const current = renderToText(s.term)
      if (current !== lastSnapshot) {
        lastSnapshot = current
        lastChange = Date.now()
      } else if (Date.now() - lastChange >= debounce) {
        clearInterval(interval)
        clearTimeout(timer)
        resolve({ idle: true })
      }
    }, 50)

    const timer = setTimeout(() => {
      clearInterval(interval)
      resolve({ idle: false })
    }, timeout)
  })
}

export function waitForExit(sessionId, timeout = 30000) {
  const s = get(sessionId)
  if (s.exited) return Promise.resolve({ exitCode: s.exitCode })

  return new Promise((resolve, reject) => {
    const onExited = (id, exitCode) => {
      if (id !== sessionId) return
      cleanup()
      resolve({ exitCode })
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`session "${sessionId}" still running after ${timeout}ms`))
    }, timeout)
    const cleanup = () => {
      clearTimeout(timer)
      events.off('exited', onExited)
    }
    events.on('exited', onExited)
  })
}

import pty from 'node-pty'
const { spawn } = pty
import xterm from '@xterm/headless'
const { Terminal } = xterm
import { renderToPng, renderToText, renderToAnsi, readRegion } from './renderer.js'
import { resolveKeys, buildMouseSequence } from './keys.js'
import { EventEmitter } from 'events'

export const events = new EventEmitter()

let nextId = 1
const sessions = new Map()
const INTERACTIVE_SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'ksh'])

function killAll() {
  for (const s of sessions.values()) {
    try { s.pty.kill() } catch {}
  }
  sessions.clear()
}

process.on('SIGTERM', killAll)
process.on('SIGINT', killAll)
process.on('SIGHUP', killAll)
process.on('exit', killAll)

export function launch(command, { cols = 80, rows = 24, cwd, env } = {}) {
  const args = typeof command === 'string' ? command.split(/\s+/) : [...command]
  const cmd = args.shift()
  if (cmd && args.length === 0 && INTERACTIVE_SHELLS.has(cmd)) args.push('-i')

  const term = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true })

  const pty = spawn(cmd, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...env },
  })

  const id = String(nextId++)
  const session = {
    id,
    command,
    pid: pty.pid,
    pty,
    term,
    cols,
    rows,
    exited: false,
    exitCode: null,
    _bufferTimer: null,
  }

  pty.onData((data) => {
    term.write(data)
    if (!session._bufferTimer) {
      session._bufferTimer = setTimeout(() => {
        session._bufferTimer = null
        events.emit('buffer', session.id)
      }, 150)
    }
  })

  pty.onExit(({ exitCode }) => {
    session.exited = true
    session.exitCode = exitCode
    if (session._bufferTimer) {
      clearTimeout(session._bufferTimer)
      session._bufferTimer = null
    }
    events.emit('exited', session.id, exitCode)
  })

  sessions.set(id, session)
  events.emit('created', sessionInfo(session))
  return { sessionId: id, pid: pty.pid }
}

function get(sessionId) {
  const s = sessions.get(sessionId)
  if (!s) throw new Error(`no session with id "${sessionId}"`)
  return s
}

function getRunning(sessionId) {
  const s = get(sessionId)
  if (s.exited) throw new Error(`session "${sessionId}" has already exited`)
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
  return [...sessions.values()].filter(s => !s.exited).map(sessionInfo)
}

export function kill(sessionId) {
  const s = get(sessionId)
  if (!s.exited) s.pty.kill()
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

export function screenshot(sessionId) {
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
        resolve(true)
      }
    }, 50)

    const timer = setTimeout(() => {
      clearInterval(interval)
      resolve(true)
    }, timeout)
  })
}

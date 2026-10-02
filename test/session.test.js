import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import * as session from '../src/session.js'

const launched = []

async function launch(command, opts) {
  const result = await session.launch(command, opts)
  launched.push(result.sessionId)
  return result
}

after(() => {
  for (const id of launched) {
    try { session.kill(id) } catch {}
  }
})

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

test('snapshot shows the current screen after output scrolls', async () => {
  const { sessionId } = await launch(
    'i=1; while [ "$i" -le 50 ]; do echo line-$i; i=$((i+1)); done; sleep 30',
    { cols: 40, rows: 10 }
  )
  await session.waitForText(sessionId, 'line-50', 5000)

  const snap = session.snapshot(sessionId)
  assert.match(snap, /line-50/)
  assert.doesNotMatch(snap, /line-1\b/)
})

test('scrollback returns the full history including scrolled-off lines', async () => {
  const { sessionId } = await launch(
    'i=1; while [ "$i" -le 50 ]; do echo line-$i; i=$((i+1)); done; sleep 30',
    { cols: 40, rows: 10 }
  )
  await session.waitForText(sessionId, 'line-50', 5000)

  const full = session.getScrollback(sessionId)
  assert.match(full, /line-1\b/)
  assert.match(full, /line-50/)

  const tail = session.getScrollback(sessionId, 5)
  assert.doesNotMatch(tail, /line-1\b/)
  assert.match(tail, /line-50/)
})

test('raw output retains head and tail of the byte stream', async () => {
  const { sessionId } = await launch('sh -c "printf begin-marker; sleep 0.2; printf end-marker; sleep 30"')
  await session.waitForText(sessionId, 'end-marker', 5000)

  const head = session.getRawOutput(sessionId, { part: 'head' })
  assert.match(head.text, /begin-marker/)
  const tail = session.getRawOutput(sessionId, { part: 'tail' })
  assert.match(tail.text, /end-marker/)
  assert.ok(tail.totalBytes > 0)
})

test('waitForExit resolves with the exit code', async () => {
  const { sessionId } = await launch('sh -c "exit 7"')
  const { exitCode } = await session.waitForExit(sessionId, 5000)
  assert.equal(exitCode, 7)
})

test('exited sessions stay listed and readable', async () => {
  const { sessionId } = await launch('sh -c "echo final-words"')
  await session.waitForExit(sessionId, 5000)
  await sleep(300)

  const info = session.status(sessionId)
  assert.equal(info.exited, true)
  assert.equal(info.exitCode, 0)

  const listed = session.listSessions().find(s => s.sessionId === sessionId)
  assert.ok(listed)
  assert.equal(listed.exited, true)

  assert.match(session.snapshot(sessionId), /final-words/)
})

test('waitForIdle reports idle vs still-changing', async () => {
  const quiet = await launch('sh -c "echo settled; sleep 30"')
  await session.waitForText(quiet.sessionId, 'settled', 5000)
  const settled = await session.waitForIdle(quiet.sessionId, 3000, 200)
  assert.equal(settled.idle, true)

  const busy = await launch('i=0; while true; do i=$((i+1)); echo tick-$i; done')
  await session.waitForText(busy.sessionId, 'tick-', 5000)
  const churning = await session.waitForIdle(busy.sessionId, 600, 500)
  assert.equal(churning.idle, false)
  session.kill(busy.sessionId)
})

test('send keys reach the app', async () => {
  const { sessionId } = await launch('cat', { cols: 40, rows: 10 })
  session.sendText(sessionId, 'hello')
  session.sendKeys(sessionId, 'Enter')
  await session.waitForText(sessionId, 'hello\\s*\\n\\s*hello', 5000)
})

test('kill removes the session', async () => {
  const { sessionId } = await launch('sh -c "sleep 30"')
  session.kill(sessionId)
  assert.equal(session.listSessions().find(s => s.sessionId === sessionId), undefined)
  assert.throws(() => session.snapshot(sessionId), /no session/)
})

test('terminal queries are answered', async () => {
  // Asks for the cursor position (DSR 6) and prints what came back. Before
  // replies were wired to the pty, read timed out and printed NONE.
  const { sessionId } = await launch(
    `python3 -c "
import os, sys, tty, termios, select
fd = sys.stdin.fileno(); old = termios.tcgetattr(fd); tty.setraw(fd)
try:
    os.write(1, b'\\x1b[6n')
    r = select.select([fd], [], [], 2)[0]
    got = os.read(fd, 32) if r else b''
finally:
    termios.tcsetattr(fd, termios.TCSADRAIN, old)
print('REPLY ' + (repr(got) if got else 'NONE'))
"; sleep 30`,
    { cols: 60, rows: 10 }
  )
  await session.waitForText(sessionId, 'REPLY', 5000)
  assert.match(session.snapshot(sessionId), /REPLY b'\\x1b\[\d+;\d+R'/)
})

test('settled waits for written output to reach the screen', async () => {
  // A burst of output followed by a marker: once the raw stream contains the
  // marker, a snapshot taken without waiting for the parser could still show
  // an earlier screen.
  for (let i = 0; i < 3; i++) {
    const { sessionId } = await launch("sh -c 'seq 1 200000; echo ENDMARK; sleep 30'", { cols: 80, rows: 24 })
    const deadline = Date.now() + 15000
    while (!session.getRawOutput(sessionId, { limit: 200 }).text.includes('ENDMARK')) {
      if (Date.now() > deadline) throw new Error('no output')
      await sleep(1)
    }
    await session.settled(sessionId)
    assert.match(session.snapshot(sessionId), /ENDMARK/)
  }
})

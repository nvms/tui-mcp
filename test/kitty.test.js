import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import * as session from '../src/session.js'

const launched = []
after(() => {
  for (const id of launched) {
    try { session.kill(id) } catch {}
  }
})

// A tiny app: optionally enables the kitty keyboard protocol, then prints the
// bytes it receives on stdin as hex.
const app = (enable) => `node -e "
process.stdin.setRawMode(true);
${enable ? "process.stdout.write('\\\\x1b[>1u');" : ''}
process.stdout.write('ready\\\\n');
process.stdin.on('data', (d) => process.stdout.write('got:' + d.toString('hex') + '\\\\n'));
"`

async function launch(command) {
  const result = await session.launch(command, { cols: 60, rows: 10 })
  launched.push(result.sessionId)
  await session.waitForText(result.sessionId, 'ready', 5000)
  return result.sessionId
}

test('send_keys uses the kitty encoding once the app enables the protocol', async () => {
  const id = await launch(app(true))
  session.sendKeys(id, 'Ctrl+Space')
  await session.waitForText(id, 'got:1b5b33323b3575', 5000) // ESC [ 3 2 ; 5 u
})

test('without the protocol, Ctrl+Space is still NUL', async () => {
  const id = await launch(app(false))
  session.sendKeys(id, 'Ctrl+Space')
  await session.waitForText(id, 'got:00', 5000)
})

test('the app can query the active flags (CSI ? u)', async () => {
  const query = `node -e "
process.stdin.setRawMode(true);
process.stdout.write('\\\\x1b[>1u\\\\x1b[?u');
process.stdin.once('data', (d) => process.stdout.write('reply:' + JSON.stringify(d.toString()) + '\\\\n'));
"`
  const result = await session.launch(query, { cols: 60, rows: 10 })
  launched.push(result.sessionId)
  const text = await session.waitForText(result.sessionId, 'reply:', 5000)
  assert.ok(text)
  assert.match(session.snapshot(result.sessionId), /reply:"\\u001b\[\?1u"/)
})

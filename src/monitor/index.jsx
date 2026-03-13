import {
  mount, createSignal, createEffect, onCleanup,
  useInput, List, ScrollableText, SplitPane, Spacer,
} from '@trendr/core'
import { connect } from './client.js'

const CYAN = '#00bcd4'
const DIM = '#555555'

function sessionKey(source, sessionId) {
  return `${source}:${sessionId}`
}

function sortByPid(list) {
  return [...list].sort((a, b) => a.pid - b.pid)
}

function App() {
  const [sessions, setSessions] = createSignal([])
  const [selected, setSelected] = createSignal(0)
  const [buffers, setBuffers] = createSignal({})
  const [fullscreen, setFullscreen] = createSignal(false)
  const [connected, setConnected] = createSignal(false)

  createEffect(() => {
    const client = connect()

    client.on('message', (msg) => {
      const src = msg._source

      if (msg.type === 'sessions') {
        setSessions(prev => {
          const other = prev.filter(s => s._source !== src)
          const incoming = msg.sessions.map(s => ({ ...s, _source: src, _key: sessionKey(src, s.sessionId) }))
          return sortByPid([...other, ...incoming])
        })
      }

      if (msg.type === 'created') {
        const s = { ...msg.session, _source: src, _key: sessionKey(src, msg.session.sessionId) }
        setSessions(prev => sortByPid([...prev, s]))
      }

      if (msg.type === 'killed') {
        const key = sessionKey(src, msg.sessionId)
        setSessions(prev => prev.filter(s => s._key !== key))
        setBuffers(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }

      if (msg.type === 'exited') {
        const key = sessionKey(src, msg.sessionId)
        setSessions(prev => prev.map(s =>
          s._key === key ? { ...s, exited: true, exitCode: msg.exitCode } : s
        ))
      }

      if (msg.type === 'buffer') {
        const key = sessionKey(src, msg.sessionId)
        setBuffers(prev => ({ ...prev, [key]: msg.ansi }))
      }
    })

    client.on('connected', () => setConnected(true))

    client.on('server_lost', (src) => {
      setSessions(prev => prev.filter(s => s._source !== src))
      setBuffers(prev => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (k.startsWith(src + ':')) delete next[k]
        }
        return next
      })
    })

    onCleanup(() => client.destroy())
  })

  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
    if (key === 'return') setFullscreen(f => !f)
    if (key === 'escape') setFullscreen(false)
  })

  const currentSession = () => sessions()[selected()]
  const currentBuffer = () => {
    const s = currentSession()
    return s ? buffers()[s._key] || '' : ''
  }

  if (!connected()) {
    return (
      <box style={{ padding: 1 }}>
        <text style={{ color: DIM }}>waiting for tui-mcp server...</text>
      </box>
    )
  }

  if (fullscreen()) {
    return (
      <box style={{ flexDirection: 'column', height: '100%' }}>
        <FullscreenHeader session={currentSession()} />
        <box style={{ flexGrow: 1 }}>
          <ScrollableText content={currentBuffer()} />
        </box>
      </box>
    )
  }

  return (
    <SplitPane sizes={[28, '1fr']} border="single" borderColor={DIM} style={{ height: '100%' }}>
      <box style={{ flexDirection: 'column', height: '100%' }}>
        <SessionHeader count={sessions().length} />
        <box style={{ flexGrow: 1 }}>
          <List
            items={sessions()}
            selected={selected()}
            onSelect={setSelected}
            renderItem={(item, { selected: sel, focused: foc }) => (
              <SessionRow session={item} selected={sel} focused={foc} />
            )}
          />
        </box>
        <StatusBar />
      </box>
      <box style={{ flexDirection: 'column', height: '100%' }}>
        <PreviewHeader session={currentSession()} />
        <box style={{ flexGrow: 1 }}>
          <ScrollableText content={currentBuffer()} />
        </box>
      </box>
    </SplitPane>
  )
}

function SessionHeader({ count }) {
  return (
    <box style={{ flexDirection: 'row', paddingX: 1 }}>
      <text style={{ color: CYAN, bold: true }}>sessions</text>
      <Spacer />
      <text style={{ color: DIM }}>{count}</text>
    </box>
  )
}

function PreviewHeader({ session }) {
  if (!session) return <text style={{ color: DIM, paddingX: 1 }}>no sessions</text>

  return (
    <box style={{ flexDirection: 'row', paddingX: 1 }}>
      <text style={{ color: CYAN, bold: true }}>{session.command}</text>
      <Spacer />
      <text style={{ color: DIM }}>pid {session.pid}  {session.cols}x{session.rows}</text>
    </box>
  )
}

function FullscreenHeader({ session }) {
  if (!session) return <text style={{ color: DIM }}>no sessions</text>

  return (
    <box style={{ flexDirection: 'row', paddingX: 1 }}>
      <text style={{ color: CYAN, bold: true }}>{session.command}</text>
      <Spacer />
      <text style={{ color: DIM }}>pid {session.pid}  {session.cols}x{session.rows}  esc: back</text>
    </box>
  )
}

function SessionRow({ session, selected, focused }) {
  const bg = selected ? (focused ? CYAN : 'gray') : null
  const fg = selected ? 'black' : null
  const dot = session.exited ? 'o' : '*'
  const dotColor = selected ? 'black' : (session.exited ? DIM : CYAN)

  const cmd = session.command.length > 18
    ? session.command.slice(0, 18) + '..'
    : session.command

  const pidStr = String(session.pid).padEnd(6)

  return (
    <box style={{ flexDirection: 'row', paddingX: 1, bg }}>
      <text style={{ color: dotColor }}>{dot} </text>
      <text style={{ color: fg || DIM }}>{pidStr}</text>
      <text style={{ color: fg || '#aaaaaa' }}>{cmd}</text>
    </box>
  )
}

function StatusBar() {
  return (
    <box style={{ flexDirection: 'row', paddingX: 1 }}>
      <text style={{ color: DIM }}>j/k nav  enter fullscreen  q quit</text>
    </box>
  )
}

mount(App, { title: 'tui-mcp monitor' })

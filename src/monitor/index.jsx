import {
  mount, createSignal, createEffect, onCleanup,
  useInput, List, ScrollableText, SplitPane, Spacer,
} from '@trendr/core'
import { connect } from './client.js'

const CYAN = '#00bcd4'
const DIM = '#555555'

function App() {
  const [sessions, setSessions] = createSignal([])
  const [selected, setSelected] = createSignal(0)
  const [buffers, setBuffers] = createSignal({})
  const [fullscreen, setFullscreen] = createSignal(false)
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal(null)

  createEffect(() => {
    const client = connect()

    client.on('message', (msg) => {
      if (msg.type === 'sessions') {
        setSessions(msg.sessions)
        setConnected(true)
      }

      if (msg.type === 'created') {
        setSessions(prev => [...prev, msg.session])
      }

      if (msg.type === 'killed') {
        setSessions(prev => prev.filter(s => s.sessionId !== msg.sessionId))
        setBuffers(prev => {
          const next = { ...prev }
          delete next[msg.sessionId]
          return next
        })
      }

      if (msg.type === 'exited') {
        setSessions(prev => prev.map(s =>
          s.sessionId === msg.sessionId
            ? { ...s, exited: true, exitCode: msg.exitCode }
            : s
        ))
      }

      if (msg.type === 'buffer') {
        setBuffers(prev => ({ ...prev, [msg.sessionId]: msg.ansi }))
      }
    })

    client.on('error', (err) => {
      setConnected(false)
      setError(err.message)
    })

    client.on('close', () => setConnected(false))

    onCleanup(() => client.removeAllListeners())
  })

  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
    if (key === 'return') setFullscreen(f => !f)
    if (key === 'escape') setFullscreen(false)
  })

  const currentSession = () => sessions()[selected()]
  const currentBuffer = () => {
    const s = currentSession()
    return s ? buffers()[s.sessionId] || '' : ''
  }

  if (!connected()) {
    return (
      <box style={{ padding: 1 }}>
        <text style={{ color: error() ? 'red' : DIM }}>
          {error()
            ? `could not connect: ${error()}`
            : 'connecting to tui-mcp...'}
        </text>
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

  const cmd = session.command.length > 20
    ? session.command.slice(0, 20) + '...'
    : session.command

  return (
    <box style={{ flexDirection: 'row', paddingX: 1, bg }}>
      <text style={{ color: dotColor }}>{dot}</text>
      <text style={{ color: fg || '#aaaaaa' }}> {session.sessionId} {cmd}</text>
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

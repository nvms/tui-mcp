#!/usr/bin/env node

if (process.argv[2] === 'monitor') {
  const { spawnSync } = await import('child_process')
  const { dirname, join } = await import('path')
  const { fileURLToPath } = await import('url')
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const app = join(__dirname, '..', 'dist', 'monitor.js')
  spawnSync(process.execPath, [app], { stdio: 'inherit' })
  process.exit(0)
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as session from './session.js'
import { startIpc } from './ipc.js'

startIpc()

const server = new McpServer(
  { name: 'tui-mcp', version: '1.1.0' },
  { capabilities: { logging: {} } }
)

server.registerTool('launch', {
  title: 'Launch TUI',
  description: 'Launch a TUI application in a managed pseudo-terminal. Returns a session ID for subsequent interactions.',
  inputSchema: {
    command: z.string().describe('Command to run (e.g. "node app.js", "vim file.txt", "htop")'),
    cols: z.number().optional().describe('Terminal width in columns (default: 80)'),
    rows: z.number().optional().describe('Terminal height in rows (default: 24)'),
    cwd: z.string().optional().describe('Working directory for the process'),
    env: z.record(z.string()).optional().describe('Extra environment variables (merged over the server environment)'),
  },
}, async ({ command, cols, rows, cwd, env }) => {
  const result = await session.launch(command, { cols, rows, cwd, env })
  const isError = result.exited === true
  return { content: [{ type: 'text', text: JSON.stringify(result) }], isError }
})

server.registerTool('list_sessions', {
  title: 'List Sessions',
  description: 'List TUI sessions with their IDs, commands, and dimensions. Includes recently exited sessions (with exitCode) - their final buffer stays readable for a few minutes.',
}, async () => {
  const list = session.listSessions()
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] }
})

server.registerTool('status', {
  title: 'Session Status',
  description: 'Get the status of one session: command, pid, dimensions, and whether it exited (with exit code).',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
  },
}, async ({ sessionId }) => {
  const info = session.status(sessionId)
  return { content: [{ type: 'text', text: JSON.stringify(info) }] }
})

server.registerTool('kill', {
  title: 'Kill Session',
  description: 'Terminate a TUI session and its underlying process.',
  inputSchema: {
    sessionId: z.string().describe('Session ID to kill'),
  },
}, async ({ sessionId }) => {
  session.kill(sessionId)
  return { content: [{ type: 'text', text: `killed session ${sessionId}` }] }
})

server.registerTool('resize', {
  title: 'Resize Terminal',
  description: 'Resize the terminal dimensions of a session. The TUI app will receive a SIGWINCH signal.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    cols: z.number().describe('New width in columns'),
    rows: z.number().describe('New height in rows'),
  },
}, async ({ sessionId, cols, rows }) => {
  session.resize(sessionId, cols, rows)
  return { content: [{ type: 'text', text: `resized to ${cols}x${rows}` }] }
})

server.registerTool('screenshot', {
  title: 'Screenshot',
  description: 'Capture the terminal as a PNG image. Shows exactly what a user would see - colors, styling, layout.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
  },
}, async ({ sessionId }) => {
  const png = await session.screenshot(sessionId)
  return {
    content: [{
      type: 'image',
      data: png.toString('base64'),
      mimeType: 'image/png',
    }],
  }
})

server.registerTool('snapshot', {
  title: 'Text Snapshot',
  description: 'Capture the terminal buffer as plain text. Faster and cheaper than a screenshot - use this when you only need the text content.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
  },
}, async ({ sessionId }) => {
  const text = session.snapshot(sessionId)
  return { content: [{ type: 'text', text }] }
})

server.registerTool('scrollback', {
  title: 'Scrollback',
  description: 'Read the terminal buffer as plain text including scrollback history, oldest line first. Use this to see output that has scrolled off screen; snapshot only shows the current viewport.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    lines: z.number().optional().describe('Only return the last N lines (default: entire buffer)'),
  },
}, async ({ sessionId, lines }) => {
  const text = session.getScrollback(sessionId, lines)
  return { content: [{ type: 'text', text }] }
})

server.registerTool('output', {
  title: 'Raw Output',
  description: 'Read the raw byte stream the app wrote to the pty, including escape sequences - useful for debugging exactly what a program emits. The first 64KB (head) and most recent 256KB (tail) are retained.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    part: z.enum(['head', 'tail']).optional().describe('Read from the start or the end of the stream (default: tail)'),
    limit: z.number().optional().describe('Max characters to return (default: 10000)'),
  },
}, async ({ sessionId, part, limit }) => {
  const result = session.getRawOutput(sessionId, { part, limit })
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
})

server.registerTool('read_region', {
  title: 'Read Region',
  description: 'Read a rectangular region of the terminal buffer as text.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    row: z.number().describe('Starting row (0-based)'),
    col: z.number().describe('Starting column (0-based)'),
    width: z.number().describe('Width in columns'),
    height: z.number().describe('Height in rows'),
  },
}, async ({ sessionId, row, col, width, height }) => {
  const text = session.getRegion(sessionId, row, col, width, height)
  return { content: [{ type: 'text', text }] }
})

server.registerTool('cursor', {
  title: 'Get Cursor',
  description: 'Get the current cursor position in the terminal.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
  },
}, async ({ sessionId }) => {
  const pos = session.getCursor(sessionId)
  return { content: [{ type: 'text', text: JSON.stringify(pos) }] }
})

server.registerTool('send_keys', {
  title: 'Send Keys',
  description: 'Send keystrokes to the TUI app. Use this for special keys and shortcuts, not for typing text (use send_text for that). Accepts a single key descriptor string or an array of key descriptors to send in sequence. Supports named keys (Enter, Tab, Escape, Up, Down, Left, Right, Backspace, Delete, Home, End, PageUp, PageDown, F1-F12, Space; case-insensitive) and modifiers (Ctrl+, Alt+, Shift+), including modified navigation keys like Ctrl+Up or Alt+Left. Examples: "Enter", "Ctrl+C", ["Down", "Down", "Down", "Enter"], ["Escape", ":wq", "Enter"].',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    keys: z.union([z.string(), z.array(z.string())]).describe('Key descriptor or array of key descriptors (e.g. "Enter", "Ctrl+C", ["Down", "Down", "Enter"])'),
  },
}, async ({ sessionId, keys }) => {
  const seq = Array.isArray(keys) ? keys : [keys]
  for (const k of seq) session.sendKeys(sessionId, k)
  return { content: [{ type: 'text', text: `sent: ${seq.join(', ')}` }] }
})

server.registerTool('send_text', {
  title: 'Send Text',
  description: 'Type a string of characters into the TUI app. The text is sent exactly as provided - MCP JSON handles escaping, so do not double-escape. To type a literal backslash, send one backslash. Include a trailing newline (\\n) if you want to press Enter after the text. Use send_keys instead for special keys like Ctrl+C or arrow keys.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    text: z.string().describe('Text to type. Include \\n for Enter/newline.'),
  },
}, async ({ sessionId, text }) => {
  session.sendText(sessionId, text)
  return { content: [{ type: 'text', text: `typed ${text.length} chars` }] }
})

server.registerTool('send_mouse', {
  title: 'Send Mouse Event',
  description: 'Send a mouse event to the TUI app (if the app has mouse support enabled).',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    action: z.enum(['press', 'release', 'scroll']).describe('Mouse action type'),
    x: z.number().describe('Column position (0-based)'),
    y: z.number().describe('Row position (0-based)'),
    button: z.string().optional().describe('Mouse button: "left", "middle", "right" for press/release; "up", "down" for scroll (default: "left")'),
  },
}, async ({ sessionId, action, x, y, button }) => {
  session.sendMouse(sessionId, action, x, y, button)
  return { content: [{ type: 'text', text: `mouse ${action} at (${x},${y})` }] }
})

server.registerTool('wait_for_text', {
  title: 'Wait For Text',
  description: 'Wait until a regex pattern appears in the terminal buffer. Useful for waiting for prompts, loading states, or specific output.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    pattern: z.string().describe('Regex pattern to search for in the terminal text'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 5000)'),
  },
}, async ({ sessionId, pattern, timeout }) => {
  try {
    await session.waitForText(sessionId, pattern, timeout)
    return { content: [{ type: 'text', text: `found: ${pattern}` }] }
  } catch (e) {
    return { content: [{ type: 'text', text: e.message }], isError: true }
  }
})

server.registerTool('wait_for_idle', {
  title: 'Wait For Idle',
  description: 'Wait until the terminal buffer stops changing. Useful after sending keys to wait for the app to finish rendering.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    timeout: z.number().optional().describe('Max wait time in milliseconds (default: 3000)'),
    debounce: z.number().optional().describe('How long the buffer must be stable before considered idle, in ms (default: 300)'),
  },
}, async ({ sessionId, timeout, debounce }) => {
  const { idle } = await session.waitForIdle(sessionId, timeout, debounce)
  const text = idle ? 'idle' : 'timeout: buffer was still changing when the wait expired'
  return { content: [{ type: 'text', text }], isError: !idle }
})

server.registerTool('wait_for_exit', {
  title: 'Wait For Exit',
  description: 'Wait until the session process exits and return its exit code. Useful after launching a finite command (build, test run, script).',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  },
}, async ({ sessionId, timeout }) => {
  try {
    const { exitCode } = await session.waitForExit(sessionId, timeout)
    return { content: [{ type: 'text', text: JSON.stringify({ exited: true, exitCode }) }] }
  } catch (e) {
    return { content: [{ type: 'text', text: e.message }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)

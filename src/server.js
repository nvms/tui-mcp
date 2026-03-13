#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as session from './session.js'

const server = new McpServer(
  { name: 'tui-mcp', version: '1.0.0' },
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
  },
}, async ({ command, cols, rows, cwd }) => {
  const result = session.launch(command, { cols, rows, cwd })
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
})

server.registerTool('list_sessions', {
  title: 'List Sessions',
  description: 'List all active TUI sessions with their IDs, commands, and dimensions.',
}, async () => {
  const list = session.listSessions()
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] }
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
  const png = session.screenshot(sessionId)
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
  description: 'Send a keystroke or key combination to the TUI app. Supports named keys (Enter, Tab, Escape, Up, Down, Left, Right, Backspace, Delete, Home, End, PageUp, PageDown, F1-F12, Space) and modifiers (Ctrl+, Alt+, Shift+). Examples: "Enter", "Ctrl+C", "Alt+Tab", "Shift+Up", "q", "j".',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    keys: z.string().describe('Key descriptor (e.g. "Enter", "Ctrl+C", "Up", "q")'),
  },
}, async ({ sessionId, keys }) => {
  session.sendKeys(sessionId, keys)
  return { content: [{ type: 'text', text: `sent: ${keys}` }] }
})

server.registerTool('send_text', {
  title: 'Send Text',
  description: 'Type a string of characters into the TUI app. Use this for text input rather than sending individual keys.',
  inputSchema: {
    sessionId: z.string().describe('Session ID'),
    text: z.string().describe('Text to type'),
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
  await session.waitForIdle(sessionId, timeout, debounce)
  return { content: [{ type: 'text', text: 'idle' }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)

const KEY_MAP = {
  'Enter': '\r',
  'Return': '\r',
  'Tab': '\t',
  'Escape': '\x1b',
  'Esc': '\x1b',
  'Backspace': '\x7f',
  'Delete': '\x1b[3~',
  'Up': '\x1b[A',
  'Down': '\x1b[B',
  'Right': '\x1b[C',
  'Left': '\x1b[D',
  'Home': '\x1b[H',
  'End': '\x1b[F',
  'PageUp': '\x1b[5~',
  'PageDown': '\x1b[6~',
  'Insert': '\x1b[2~',
  'F1': '\x1bOP',
  'F2': '\x1bOQ',
  'F3': '\x1bOR',
  'F4': '\x1bOS',
  'F5': '\x1b[15~',
  'F6': '\x1b[17~',
  'F7': '\x1b[18~',
  'F8': '\x1b[19~',
  'F9': '\x1b[20~',
  'F10': '\x1b[21~',
  'F11': '\x1b[23~',
  'F12': '\x1b[24~',
  'Space': ' ',
}

const CTRL_MAP = {}
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(97 + i)
  CTRL_MAP[letter] = String.fromCharCode(i + 1)
}

export function resolveKeys(descriptor) {
  const parts = descriptor.split('+')
  const modifiers = { ctrl: false, alt: false, shift: false }
  let key = parts.pop()

  for (const mod of parts) {
    const m = mod.toLowerCase()
    if (m === 'ctrl' || m === 'control') modifiers.ctrl = true
    else if (m === 'alt' || m === 'meta' || m === 'option') modifiers.alt = true
    else if (m === 'shift') modifiers.shift = true
  }

  if (modifiers.ctrl && key.length === 1) {
    const seq = CTRL_MAP[key.toLowerCase()]
    if (seq) return modifiers.alt ? `\x1b${seq}` : seq
  }

  if (modifiers.shift) {
    const shiftArrows = {
      'Up': '\x1b[1;2A',
      'Down': '\x1b[1;2B',
      'Right': '\x1b[1;2C',
      'Left': '\x1b[1;2D',
      'Tab': '\x1b[Z',
    }
    if (shiftArrows[key]) return shiftArrows[key]
    if (key.length === 1) key = key.toUpperCase()
  }

  let seq = KEY_MAP[key] ?? key

  if (modifiers.alt) seq = `\x1b${seq}`

  return seq
}

export function buildMouseSequence(action, x, y, button = 'left') {
  const buttonMap = { left: 0, middle: 1, right: 2 }
  const btn = buttonMap[button] ?? 0

  if (action === 'press') {
    return `\x1b[<${btn};${x + 1};${y + 1}M`
  }
  if (action === 'release') {
    return `\x1b[<${btn};${x + 1};${y + 1}m`
  }
  if (action === 'scroll') {
    const dir = button === 'up' ? 64 : 65
    return `\x1b[<${dir};${x + 1};${y + 1}M`
  }

  return ''
}

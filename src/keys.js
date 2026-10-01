const KEY_MAP = {
  'Enter': '\r',
  'Return': '\r',
  'Tab': '\t',
  'Escape': '\x1b',
  'Esc': '\x1b',
  'Backspace': '\x7f',
  'Space': ' ',
  'Up': '\x1b[A',
  'Down': '\x1b[B',
  'Right': '\x1b[C',
  'Left': '\x1b[D',
  'Home': '\x1b[H',
  'End': '\x1b[F',
  'Insert': '\x1b[2~',
  'Delete': '\x1b[3~',
  'PageUp': '\x1b[5~',
  'PageDown': '\x1b[6~',
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
}

const CSI_LETTER = {
  'Up': 'A',
  'Down': 'B',
  'Right': 'C',
  'Left': 'D',
  'Home': 'H',
  'End': 'F',
  'F1': 'P',
  'F2': 'Q',
  'F3': 'R',
  'F4': 'S',
}

const CSI_TILDE = {
  'Insert': 2,
  'Delete': 3,
  'PageUp': 5,
  'PageDown': 6,
  'F5': 15,
  'F6': 17,
  'F7': 18,
  'F8': 19,
  'F9': 20,
  'F10': 21,
  'F11': 23,
  'F12': 24,
}

const CANONICAL = {}
for (const name of Object.keys(KEY_MAP)) CANONICAL[name.toLowerCase()] = name
CANONICAL['numpadenter'] = 'NumpadEnter'
CANONICAL['kpenter'] = 'NumpadEnter'

const CTRL_MAP = {
  ' ': '\x00',
  '@': '\x00',
  '[': '\x1b',
  '\\': '\x1c',
  ']': '\x1d',
  '^': '\x1e',
  '_': '\x1f',
  '?': '\x7f',
}
for (let i = 0; i < 26; i++) {
  CTRL_MAP[String.fromCharCode(97 + i)] = String.fromCharCode(i + 1)
}

function splitDescriptor(descriptor) {
  const parts = descriptor.split('+')
  let key = parts.pop()
  if (key === '' && descriptor.endsWith('+')) {
    key = '+'
    if (parts[parts.length - 1] === '') parts.pop()
  }
  return { parts, key }
}

// Kitty keyboard protocol (https://sw.kovidgoyal.net/kitty/keyboard-protocol/).
// Apps that turn on "disambiguate escape codes" (flag 1) - Ink and other
// modern TUIs - read keys whose legacy bytes are ambiguous as CSI <code>;<mods> u:
// Ctrl+Space is NUL, Ctrl+I is Tab and Esc starts every escape sequence, so
// in legacy form the app cannot tell them apart.
const KITTY_DISAMBIGUATE = 1
const KITTY_CODE = { 'Escape': 27, 'Enter': 13, 'Tab': 9, 'Backspace': 127, 'Space': 32 }
const KITTY_NUMPAD_ENTER = 57414

function resolveKitty(canonical, key, modifiers, modCode) {
  if (canonical === 'NumpadEnter') return modCode > 1 ? `\x1b[${KITTY_NUMPAD_ENTER};${modCode}u` : `\x1b[${KITTY_NUMPAD_ENTER}u`
  if (canonical === 'Escape' && modCode === 1) return '\x1b[27u'
  if (modCode === 1) return null
  if (KITTY_CODE[canonical] !== undefined) return `\x1b[${KITTY_CODE[canonical]};${modCode}u`
  // A character with Ctrl or Alt: the code is the unshifted key; Shift alone stays text.
  if (key.length === 1 && (modifiers.ctrl || modifiers.alt)) return `\x1b[${key.toLowerCase().codePointAt(0)};${modCode}u`
  return null
}

/**
 * @param {string} descriptor  e.g. "Enter", "Ctrl+C", "Ctrl+Space"
 * @param {{ kittyFlags?: number }} [opts]  the app's current kitty keyboard
 *   flags; with flag 1 set, ambiguous keys use the kitty encoding
 */
export function resolveKeys(descriptor, { kittyFlags = 0 } = {}) {
  const { parts, key: rawKey } = splitDescriptor(descriptor)
  const modifiers = { ctrl: false, alt: false, shift: false }
  let key = rawKey

  for (const mod of parts) {
    const m = mod.toLowerCase()
    if (m === 'ctrl' || m === 'control') modifiers.ctrl = true
    else if (m === 'alt' || m === 'meta' || m === 'option') modifiers.alt = true
    else if (m === 'shift') modifiers.shift = true
  }

  const canonical = key.length > 1 ? (CANONICAL[key.toLowerCase()] ?? key) : key
  const modCode = 1 + (modifiers.shift ? 1 : 0) + (modifiers.alt ? 2 : 0) + (modifiers.ctrl ? 4 : 0)

  if (kittyFlags & KITTY_DISAMBIGUATE) {
    const seq = resolveKitty(canonical, key, modifiers, modCode)
    if (seq) return seq
  }
  if (canonical === 'NumpadEnter') return '\r'

  if (modCode > 1) {
    if (canonical === 'Tab' && modifiers.shift && !modifiers.ctrl && !modifiers.alt) return '\x1b[Z'
    if (CSI_LETTER[canonical]) return `\x1b[1;${modCode}${CSI_LETTER[canonical]}`
    if (CSI_TILDE[canonical]) return `\x1b[${CSI_TILDE[canonical]};${modCode}~`
  }

  if (modifiers.ctrl) {
    const base = canonical === 'Space' ? ' ' : key
    if (base.length === 1) {
      const seq = CTRL_MAP[base.toLowerCase()]
      if (seq) return modifiers.alt ? `\x1b${seq}` : seq
    }
  }

  if (modifiers.shift && key.length === 1) key = key.toUpperCase()

  let seq = KEY_MAP[canonical] ?? key

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

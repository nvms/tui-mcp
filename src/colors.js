const ANSI_16 = [
  '#000000', '#cc0000', '#4e9a06', '#c4a000',
  '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f',
  '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
]

const PALETTE_256 = [...ANSI_16]

for (let r = 0; r < 6; r++) {
  for (let g = 0; g < 6; g++) {
    for (let b = 0; b < 6; b++) {
      const ri = r ? 55 + r * 40 : 0
      const gi = g ? 55 + g * 40 : 0
      const bi = b ? 55 + b * 40 : 0
      PALETTE_256.push(`rgb(${ri},${gi},${bi})`)
    }
  }
}

for (let i = 0; i < 24; i++) {
  const v = 8 + i * 10
  PALETTE_256.push(`rgb(${v},${v},${v})`)
}

export const DEFAULT_FG = '#d4d4d4'
export const DEFAULT_BG = '#1e1e1e'

export function unpackRgb(packed) {
  const r = (packed >> 16) & 0xFF
  const g = (packed >> 8) & 0xFF
  const b = packed & 0xFF
  return `rgb(${r},${g},${b})`
}

export function resolveFg(cell) {
  if (cell.isFgRGB()) return unpackRgb(cell.getFgColor())
  if (cell.isFgPalette()) return PALETTE_256[cell.getFgColor()] ?? DEFAULT_FG
  return DEFAULT_FG
}

export function resolveBg(cell) {
  if (cell.isBgRGB()) return unpackRgb(cell.getBgColor())
  if (cell.isBgPalette()) return PALETTE_256[cell.getBgColor()] ?? DEFAULT_BG
  return null
}

export function resolveDimColor(color) {
  const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/)
  if (match) {
    const [, r, g, b] = match.map(Number)
    return `rgb(${r >> 1},${g >> 1},${b >> 1})`
  }
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16) >> 1
    const g = parseInt(color.slice(3, 5), 16) >> 1
    const b = parseInt(color.slice(5, 7), 16) >> 1
    return `rgb(${r},${g},${b})`
  }
  return color
}

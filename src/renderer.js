import { createCanvas } from 'canvas'
import { resolveFg, resolveBg, resolveDimColor, DEFAULT_FG, DEFAULT_BG } from './colors.js'

const CELL_WIDTH = 9
const CELL_HEIGHT = 18
const FONT_SIZE = 14
const FONT_FAMILY = 'monospace'
const PADDING = 8

export function renderToPng(term) {
  const cols = term.cols
  const rows = term.rows
  const width = cols * CELL_WIDTH + PADDING * 2
  const height = rows * CELL_HEIGHT + PADDING * 2
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = DEFAULT_BG
  ctx.fillRect(0, 0, width, height)

  const buf = term.buffer.active
  const nullCell = buf.getNullCell()

  for (let y = 0; y < rows; y++) {
    const line = buf.getLine(y)
    if (!line) continue

    for (let x = 0; x < cols; x++) {
      line.getCell(x, nullCell)
      const char = nullCell.getChars()
      const px = x * CELL_WIDTH + PADDING
      const py = y * CELL_HEIGHT + PADDING

      const inverse = nullCell.isInverse()
      let fg = resolveFg(nullCell)
      let bg = resolveBg(nullCell)

      if (inverse) {
        const tmpFg = fg
        fg = bg || DEFAULT_BG
        bg = tmpFg
      }

      if (nullCell.isDim()) fg = resolveDimColor(fg)

      if (bg) {
        ctx.fillStyle = bg
        ctx.fillRect(px, py, CELL_WIDTH, CELL_HEIGHT)
      }

      if (!char || char === ' ') continue

      const bold = nullCell.isBold() ? 'bold ' : ''
      const italic = nullCell.isItalic() ? 'italic ' : ''
      ctx.font = `${bold}${italic}${FONT_SIZE}px ${FONT_FAMILY}`
      ctx.fillStyle = fg
      ctx.textBaseline = 'top'
      ctx.fillText(char, px, py + 2)

      if (nullCell.isUnderline()) {
        ctx.strokeStyle = fg
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px, py + CELL_HEIGHT - 2)
        ctx.lineTo(px + CELL_WIDTH, py + CELL_HEIGHT - 2)
        ctx.stroke()
      }

      if (nullCell.isStrikethrough()) {
        ctx.strokeStyle = fg
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px, py + CELL_HEIGHT / 2)
        ctx.lineTo(px + CELL_WIDTH, py + CELL_HEIGHT / 2)
        ctx.stroke()
      }
    }
  }

  return canvas.toBuffer('image/png')
}

export function renderToText(term) {
  const buf = term.buffer.active
  const lines = []

  for (let y = 0; y < term.rows; y++) {
    const line = buf.getLine(y)
    if (!line) {
      lines.push('')
      continue
    }
    lines.push(line.translateToString(true))
  }

  return lines.join('\n')
}

export function readRegion(term, row, col, width, height) {
  const buf = term.buffer.active
  const lines = []

  for (let y = row; y < row + height && y < term.rows; y++) {
    const line = buf.getLine(y)
    if (!line) {
      lines.push('')
      continue
    }
    const full = line.translateToString(false)
    lines.push(full.slice(col, col + width))
  }

  return lines.join('\n')
}

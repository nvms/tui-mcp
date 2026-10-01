// Kitty keyboard protocol state (https://sw.kovidgoyal.net/kitty/keyboard-protocol/).
//
// An app enables the protocol by pushing flags (CSI > flags u), pops them on
// exit (CSI < n u), can change them in place (CSI = flags ; mode u) and asks
// which are active (CSI ? u). The main and alternate screens keep separate
// stacks. xterm.js does not implement the protocol, so we track it from the
// app's output and answer the query the way a kitty-compatible terminal would;
// sendKeys then encodes keys for the flags the app asked for.

function firstParam(params, fallback) {
  const p = params[0]
  const v = Array.isArray(p) ? p[0] : p
  return v === undefined || v === -1 ? fallback : v
}

export function trackKittyKeyboard(term, reply) {
  const stacks = { normal: [], alternate: [] }
  const stack = () => stacks[term.buffer.active.type] ?? stacks.normal
  const current = () => stack().at(-1) ?? 0

  term.parser.registerCsiHandler({ prefix: '>', final: 'u' }, (params) => {
    const s = stack()
    s.push(firstParam(params, 0))
    if (s.length > 64) s.shift() // the spec bounds the stack; keep it finite
    return true
  })
  term.parser.registerCsiHandler({ prefix: '<', final: 'u' }, (params) => {
    const s = stack()
    s.splice(Math.max(0, s.length - firstParam(params, 1)))
    return true
  })
  term.parser.registerCsiHandler({ prefix: '=', final: 'u' }, (params) => {
    const s = stack()
    const flags = firstParam(params, 0)
    const mode = Array.isArray(params[1]) ? params[1][0] : (params[1] ?? 1)
    const now = current()
    const next = mode === 2 ? now | flags : mode === 3 ? now & ~flags : flags
    if (s.length) s[s.length - 1] = next
    else s.push(next)
    return true
  })
  term.parser.registerCsiHandler({ prefix: '?', final: 'u' }, () => {
    reply(`\x1b[?${current()}u`)
    return true
  })

  return { flags: current }
}

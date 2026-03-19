#!/usr/bin/env node

// node_modules/@trendr/core/src/ansi.js
var ESC = "\x1B[";
var hideCursor = `${ESC}?25l`;
var showCursor = `${ESC}?25h`;
var clearScreen = `${ESC}2J`;
var clearLine = `${ESC}2K`;
var altScreen = `${ESC}?1049h`;
var exitAltScreen = `${ESC}?1049l`;
var sgrReset = `${ESC}0m`;
var setTitle = (title) => `\x1B]2;${title}\x07`;
var enableMouse = `${ESC}?1002h${ESC}?1006h`;
var disableMouse = `${ESC}?1002l${ESC}?1006l`;
var BOLD = 1;
var DIM = 2;
var ITALIC = 4;
var UNDERLINE = 8;
var INVERSE = 16;
var STRIKETHROUGH = 32;
var ATTR_CODES = [
  [BOLD, "1"],
  [DIM, "2"],
  [ITALIC, "3"],
  [UNDERLINE, "4"],
  [INVERSE, "7"],
  [STRIKETHROUGH, "9"]
];
var NAMED_COLORS = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  gray: 8,
  grey: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15
};
function parseColor(color, offset) {
  if (color == null) return null;
  if (typeof color === "number") return `${offset};5;${color}`;
  if (color in NAMED_COLORS) return `${offset};5;${NAMED_COLORS[color]}`;
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `${offset};2;${r};${g};${b}`;
  }
  return null;
}
var INDEX_TO_NAME = Object.entries(NAMED_COLORS).filter(([k]) => k !== "grey").reduce((map, [name, idx]) => {
  map[idx] = name;
  return map;
}, {});
function basicFgToIndex(code) {
  if (code >= 30 && code <= 37) return code - 30;
  if (code >= 90 && code <= 97) return code - 90 + 8;
  return null;
}
function basicBgToIndex(code) {
  if (code >= 40 && code <= 47) return code - 40;
  if (code >= 100 && code <= 107) return code - 100 + 8;
  return null;
}
function indexToColor(idx) {
  return INDEX_TO_NAME[idx] ?? idx;
}
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function parseSgr(params, state) {
  if (!state) state = { fg: null, bg: null, attrs: 0 };
  const codes = params.split(";").map(Number);
  let i = 0;
  while (i < codes.length) {
    const c = codes[i];
    if (c === 0) {
      state.fg = null;
      state.bg = null;
      state.attrs = 0;
    } else if (c === 1) state.attrs |= BOLD;
    else if (c === 2) state.attrs |= DIM;
    else if (c === 3) state.attrs |= ITALIC;
    else if (c === 4) state.attrs |= UNDERLINE;
    else if (c === 7) state.attrs |= INVERSE;
    else if (c === 9) state.attrs |= STRIKETHROUGH;
    else if (c === 22) state.attrs &= ~(BOLD | DIM);
    else if (c === 23) state.attrs &= ~ITALIC;
    else if (c === 24) state.attrs &= ~UNDERLINE;
    else if (c === 27) state.attrs &= ~INVERSE;
    else if (c === 29) state.attrs &= ~STRIKETHROUGH;
    else if (c === 39) state.fg = null;
    else if (c === 49) state.bg = null;
    else if (c === 38 && codes[i + 1] === 5) {
      state.fg = indexToColor(codes[i + 2]);
      i += 2;
    } else if (c === 48 && codes[i + 1] === 5) {
      state.bg = indexToColor(codes[i + 2]);
      i += 2;
    } else if (c === 38 && codes[i + 1] === 2) {
      state.fg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4]);
      i += 4;
    } else if (c === 48 && codes[i + 1] === 2) {
      state.bg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4]);
      i += 4;
    } else {
      const fgIdx = basicFgToIndex(c);
      if (fgIdx != null) state.fg = indexToColor(fgIdx);
      else {
        const bgIdx = basicBgToIndex(c);
        if (bgIdx != null) state.bg = indexToColor(bgIdx);
      }
    }
    i++;
  }
  return state;
}
function sgr(fg, bg, attrs) {
  const parts = ["0"];
  for (const [mask, code] of ATTR_CODES) {
    if (attrs & mask) parts.push(code);
  }
  const fgCode = parseColor(fg, 38);
  if (fgCode) parts.push(fgCode);
  const bgCode = parseColor(bg, 48);
  if (bgCode) parts.push(bgCode);
  return `${ESC}${parts.join(";")}m`;
}

// node_modules/@trendr/core/src/wrap.js
var ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(text) {
  return text.indexOf("\x1B") === -1 ? text : text.replace(ANSI_RE, "");
}
function measureText(text) {
  const clean = stripAnsi(text);
  let width = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.codePointAt(i);
    if (code > 65535) i++;
    width += code >= 4352 && isWide(code) ? 2 : 1;
  }
  return width;
}
function* visibleChars(str) {
  let i = 0;
  let pending = "";
  while (i < str.length) {
    if (str[i] === "\x1B" && str[i + 1] === "[") {
      const end = str.indexOf("m", i + 2);
      if (end !== -1) {
        pending += str.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    const code = str.codePointAt(i);
    const len = code > 65535 ? 2 : 1;
    yield { chunk: pending + str.slice(i, i + len), width: charWidth(code) };
    pending = "";
    i += len;
  }
}
function charWidth(code) {
  return code >= 4352 && isWide(code) ? 2 : 1;
}
function sliceVisible(text, maxWidth) {
  let result = "";
  let width = 0;
  for (const { chunk, width: w } of visibleChars(text)) {
    if (width + w > maxWidth) break;
    result += chunk;
    width += w;
  }
  return result;
}
function wordWrap(text, maxWidth) {
  if (maxWidth <= 0) return [];
  if (!text) return [""];
  const lines = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    if (measureText(rawLine) <= maxWidth) {
      lines.push(rawLine);
      continue;
    }
    const words = rawLine.split(/\s+/);
    let line = "";
    let lineWidth = 0;
    for (const word of words) {
      if (!word) continue;
      const ww = measureText(word);
      if (lineWidth === 0 && ww <= maxWidth) {
        line = word;
        lineWidth = ww;
      } else if (lineWidth === 0 && ww > maxWidth) {
        for (const { chunk, width } of visibleChars(word)) {
          if (lineWidth + width > maxWidth) {
            lines.push(line);
            line = "";
            lineWidth = 0;
          }
          line += chunk;
          lineWidth += width;
        }
      } else if (lineWidth + 1 + ww <= maxWidth) {
        line += " " + word;
        lineWidth += 1 + ww;
      } else if (ww > maxWidth) {
        if (line) lines.push(line);
        line = "";
        lineWidth = 0;
        for (const { chunk, width } of visibleChars(word)) {
          if (lineWidth + width > maxWidth) {
            lines.push(line);
            line = "";
            lineWidth = 0;
          }
          line += chunk;
          lineWidth += width;
        }
      } else {
        lines.push(line);
        line = word;
        lineWidth = ww;
      }
    }
    lines.push(line);
  }
  return lines;
}
function isWide(code) {
  return code >= 4352 && code <= 4447 || code >= 8986 && code <= 8987 || code >= 9001 && code <= 9002 || code >= 9193 && code <= 9196 || code === 9200 || code === 9203 || code >= 9725 && code <= 9726 || code >= 9748 && code <= 9749 || code >= 9800 && code <= 9811 || code === 9855 || code === 9875 || code === 9889 || code >= 9898 && code <= 9899 || code >= 9917 && code <= 9918 || code >= 9924 && code <= 9925 || code === 9934 || code === 9940 || code === 9962 || code >= 9970 && code <= 9971 || code === 9973 || code === 9978 || code === 9981 || code === 9989 || code >= 9994 && code <= 9995 || code === 10024 || code === 10060 || code === 10062 || code >= 10067 && code <= 10069 || code === 10071 || code >= 10133 && code <= 10135 || code === 10160 || code === 10175 || code >= 11035 && code <= 11036 || code === 11088 || code === 11093 || code >= 11904 && code <= 12245 || code >= 12272 && code <= 12283 || code >= 12288 && code <= 12438 || code >= 12441 && code <= 12543 || code >= 12549 && code <= 12591 || code >= 12593 && code <= 12686 || code >= 12688 && code <= 12730 || code >= 12736 && code <= 12771 || code >= 12784 && code <= 12830 || code >= 12832 && code <= 13054 || code >= 13056 && code <= 19893 || code >= 19968 && code <= 40943 || code >= 40960 && code <= 42182 || code >= 44032 && code <= 55203 || code >= 63744 && code <= 64109 || code >= 64112 && code <= 64217 || code >= 65040 && code <= 65049 || code >= 65072 && code <= 65135 || code >= 65281 && code <= 65376 || code >= 65504 && code <= 65510 || code === 126980 || code === 127183 || code === 127374 || code >= 127377 && code <= 127386 || code >= 127462 && code <= 127490 || code >= 127504 && code <= 127547 || code >= 127552 && code <= 127560 || code >= 127568 && code <= 127569 || code >= 127744 && code <= 127776 || code >= 127789 && code <= 127797 || code >= 127799 && code <= 127868 || code >= 127870 && code <= 127891 || code >= 127904 && code <= 127946 || code >= 127951 && code <= 127955 || code >= 127968 && code <= 127984 || code === 127988 || code >= 127992 && code <= 128062 || code === 128064 || code >= 128066 && code <= 128252 || code >= 128255 && code <= 128317 || code >= 128331 && code <= 128334 || code >= 128336 && code <= 128359 || code === 128378 || code >= 128405 && code <= 128406 || code === 128420 || code >= 128507 && code <= 128591 || code >= 128640 && code <= 128709 || code === 128716 || code >= 128720 && code <= 128722 || code >= 128725 && code <= 128727 || code >= 128732 && code <= 128735 || code >= 128747 && code <= 128748 || code >= 128756 && code <= 128764 || code >= 128992 && code <= 129003 || code === 129008 || code >= 129292 && code <= 129338 || code >= 129340 && code <= 129349 || code >= 129351 && code <= 129535 || code >= 129648 && code <= 129660 || code >= 129664 && code <= 129672 || code >= 129680 && code <= 129725 || code >= 129727 && code <= 129733 || code >= 129742 && code <= 129755 || code >= 129760 && code <= 129768 || code >= 129776 && code <= 129784 || code >= 131072 && code <= 173782 || code >= 173824 && code <= 177972 || code >= 177984 && code <= 178205 || code >= 178208 && code <= 191456 || code >= 196608 && code <= 201546;
}

// node_modules/@trendr/core/src/buffer.js
var EMPTY = { ch: " ", fg: null, bg: null, attrs: 0 };
function createBuffer(width, height) {
  const size = width * height;
  const cells = new Array(size);
  for (let i = 0; i < size; i++) cells[i] = EMPTY;
  return { width, height, cells };
}
function clearBuffer(buf2) {
  const len = buf2.cells.length;
  for (let i = 0; i < len; i++) buf2.cells[i] = EMPTY;
}
function writeText(buf2, x, y, text, fg, bg, attrs, maxWidth) {
  if (y < 0 || y >= buf2.height) return;
  const max = maxWidth ?? buf2.width - x;
  if (text.indexOf("\x1B") === -1) {
    let col2 = 0;
    let i2 = 0;
    while (i2 < text.length && col2 < max) {
      const code = text.codePointAt(i2);
      const len = code > 65535 ? 2 : 1;
      const w = charWidth(code);
      const cx = x + col2;
      if (cx >= 0 && cx < buf2.width) {
        const ch = len === 1 ? text[i2] : text.slice(i2, i2 + len);
        const prev = buf2.cells[y * buf2.width + cx];
        const transparent = ch === " " && !bg && prev.ch !== " ";
        buf2.cells[y * buf2.width + cx] = {
          ch: transparent ? prev.ch : ch,
          fg: transparent ? prev.fg : fg ?? prev.fg,
          bg: bg ?? prev.bg,
          attrs: transparent ? prev.attrs : attrs || prev.attrs
        };
        if (w === 2 && cx + 1 < buf2.width) {
          buf2.cells[y * buf2.width + cx + 1] = { ch: "", fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 };
        }
      }
      col2 += w;
      i2 += len;
    }
    return;
  }
  let col = 0;
  const ansi = { fg: null, bg: null, attrs: 0 };
  let i = 0;
  while (i < text.length && col < max) {
    if (text[i] === "\x1B" && text[i + 1] === "[") {
      const end = text.indexOf("m", i + 2);
      if (end !== -1) {
        parseSgr(text.slice(i + 2, end), ansi);
        i = end + 1;
        continue;
      }
    }
    const code = text.codePointAt(i);
    const len = code > 65535 ? 2 : 1;
    const w = charWidth(code);
    const cx = x + col;
    if (cx >= 0 && cx < buf2.width) {
      const ch = len === 1 ? text[i] : text.slice(i, i + len);
      const prev = buf2.cells[y * buf2.width + cx];
      const transparent = ch === " " && !bg && prev.ch !== " ";
      buf2.cells[y * buf2.width + cx] = {
        ch: transparent ? prev.ch : ch,
        fg: transparent ? prev.fg : ansi.fg ?? fg ?? prev.fg,
        bg: ansi.bg ?? bg ?? prev.bg,
        attrs: transparent ? prev.attrs : ansi.attrs || attrs || prev.attrs
      };
      if (w === 2 && cx + 1 < buf2.width) {
        buf2.cells[y * buf2.width + cx + 1] = { ch: "", fg: ansi.fg ?? fg ?? null, bg: ansi.bg ?? bg ?? null, attrs: ansi.attrs || attrs || 0 };
      }
    }
    col += w;
    i += len;
  }
}
function fillRect(buf2, x, y, w, h, ch, fg, bg, attrs) {
  const x2 = Math.min(x + w, buf2.width);
  const y2 = Math.min(y + h, buf2.height);
  const x1 = Math.max(x, 0);
  const y1 = Math.max(y, 0);
  for (let row = y1; row < y2; row++) {
    for (let col = x1; col < x2; col++) {
      buf2.cells[row * buf2.width + col] = { ch: ch ?? " ", fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 };
    }
  }
}
function dimBuffer(buf2) {
  for (let i = 0; i < buf2.cells.length; i++) {
    const cell = buf2.cells[i];
    if (cell.attrs & 2) continue;
    buf2.cells[i] = { ch: cell.ch, fg: cell.fg, bg: cell.bg, attrs: cell.attrs | 2 };
  }
}
function blitRect(src, dst, x, y, w, h) {
  const x1 = Math.max(x, 0);
  const y1 = Math.max(y, 0);
  const x2 = Math.min(x + w, src.width, dst.width);
  const y2 = Math.min(y + h, src.height, dst.height);
  for (let row = y1; row < y2; row++) {
    const base = row * dst.width;
    for (let col = x1; col < x2; col++) {
      dst.cells[base + col] = src.cells[base + col];
    }
  }
}

// node_modules/@trendr/core/src/diff.js
var NAMED_COLORS2 = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  gray: 8,
  grey: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15
};
var ATTR_MASKS = [BOLD, DIM, ITALIC, UNDERLINE, INVERSE, STRIKETHROUGH];
var ATTR_SGRCODES = [49, 50, 51, 52, 55, 57];
var bufA = Buffer.allocUnsafe(2 * 1024 * 1024);
var bufB = Buffer.allocUnsafe(2 * 1024 * 1024);
var buf = bufA;
var pos = 0;
function ensure(n) {
  if (pos + n > buf.length) throw new Error("diff output buffer overflow");
}
function writeNum(n) {
  if (n >= 1e3) {
    buf[pos++] = 48 + (n / 1e3 | 0);
    n %= 1e3;
    buf[pos++] = 48 + (n / 100 | 0);
    n %= 100;
    buf[pos++] = 48 + (n / 10 | 0);
    buf[pos++] = 48 + n % 10;
  } else if (n >= 100) {
    buf[pos++] = 48 + (n / 100 | 0);
    n %= 100;
    buf[pos++] = 48 + (n / 10 | 0);
    buf[pos++] = 48 + n % 10;
  } else if (n >= 10) {
    buf[pos++] = 48 + (n / 10 | 0);
    buf[pos++] = 48 + n % 10;
  } else buf[pos++] = 48 + n;
}
function writeMoveTo(row, col) {
  ensure(12);
  buf[pos++] = 27;
  buf[pos++] = 91;
  writeNum(row);
  buf[pos++] = 59;
  writeNum(col);
  buf[pos++] = 72;
}
function writeSgr(fg, bg, attrs) {
  ensure(52);
  buf[pos++] = 27;
  buf[pos++] = 91;
  buf[pos++] = 48;
  for (let i = 0; i < 6; i++) {
    if (attrs & ATTR_MASKS[i]) {
      buf[pos++] = 59;
      buf[pos++] = ATTR_SGRCODES[i];
    }
  }
  if (fg != null) writeColor(fg, 38);
  if (bg != null) writeColor(bg, 48);
  buf[pos++] = 109;
}
function writeColor(color, offset) {
  if (typeof color === "number" || color in NAMED_COLORS2) {
    const idx = typeof color === "number" ? color : NAMED_COLORS2[color];
    buf[pos++] = 59;
    writeNum(offset);
    buf[pos++] = 59;
    buf[pos++] = 53;
    buf[pos++] = 59;
    writeNum(idx);
  } else if (color.charCodeAt(0) === 35 && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    buf[pos++] = 59;
    writeNum(offset);
    buf[pos++] = 59;
    buf[pos++] = 50;
    buf[pos++] = 59;
    writeNum(r);
    buf[pos++] = 59;
    writeNum(g);
    buf[pos++] = 59;
    writeNum(b);
  }
}
function writeReset() {
  ensure(4);
  buf[pos++] = 27;
  buf[pos++] = 91;
  buf[pos++] = 48;
  buf[pos++] = 109;
}
function writeChar(ch) {
  ensure(4);
  const code = ch.charCodeAt(0);
  if (code < 128) {
    buf[pos++] = code;
  } else {
    pos += buf.write(ch, pos);
  }
}
function cellEq(a, b) {
  return a === b || a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.attrs === b.attrs;
}
function diff(prev, curr) {
  const w = curr.width;
  const h = curr.height;
  pos = 0;
  let changed = 0;
  let lastFg = void 0;
  let lastBg = void 0;
  let lastAttrs = void 0;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const idx = y * w + x;
      if (curr.cells[idx].ch === "" || cellEq(prev.cells[idx], curr.cells[idx])) {
        x++;
        continue;
      }
      writeMoveTo(y + 1, x + 1);
      while (x < w) {
        const i = y * w + x;
        const c = curr.cells[i];
        if (c.ch === "") {
          x++;
          continue;
        }
        if (cellEq(prev.cells[i], c)) break;
        changed++;
        if (c.fg !== lastFg || c.bg !== lastBg || c.attrs !== lastAttrs) {
          writeSgr(c.fg, c.bg, c.attrs);
          lastFg = c.fg;
          lastBg = c.bg;
          lastAttrs = c.attrs;
        }
        writeChar(c.ch);
        x++;
      }
    }
  }
  if (pos > 0) writeReset();
  const output = pos > 0 ? buf.subarray(0, pos) : "";
  buf = buf === bufA ? bufB : bufA;
  return { output, changed };
}

// node_modules/@trendr/core/src/signal.js
var currentEffect = null;
var currentScope = null;
var pendingEffects = null;
var batchDepth = 0;
var schedulerHook = null;
var hookRegistrar = null;
var renderTracker = null;
function startRenderTracking() {
  renderTracker = [];
}
function stopRenderTracking() {
  const tracked = renderTracker;
  renderTracker = null;
  return tracked;
}
function setSchedulerHook(fn) {
  schedulerHook = fn;
}
function setHookRegistrar(fn) {
  hookRegistrar = fn;
}
function createSignalRaw(value) {
  const subs = /* @__PURE__ */ new Set();
  function get() {
    if (currentEffect) subs.add(currentEffect);
    if (renderTracker) renderTracker.push(get);
    return value;
  }
  function set(next) {
    const v = typeof next === "function" ? next(value) : next;
    if (v === value) return;
    value = v;
    if (batchDepth > 0) {
      for (const s of subs) pendingEffects.add(s);
    } else {
      const snapshot = [...subs];
      for (const s of snapshot) s.run();
    }
    if (schedulerHook && batchDepth === 0) schedulerHook();
  }
  return [get, set];
}
function createSignal(value) {
  if (hookRegistrar) {
    return hookRegistrar(() => createSignalRaw(value));
  }
  return createSignalRaw(value);
}
function createEffect(fn) {
  const effect = {
    fn,
    cleanup: null,
    run() {
      if (effect.cleanup) effect.cleanup();
      const prev = currentEffect;
      currentEffect = effect;
      try {
        const result = fn();
        effect.cleanup = typeof result === "function" ? result : null;
      } finally {
        currentEffect = prev;
      }
    }
  };
  effect.run();
  if (currentScope) currentScope.effects.push(effect);
  return effect;
}
function onCleanup(fn) {
  if (currentScope) currentScope.cleanups.push(fn);
  else if (currentEffect) {
    const prev = currentEffect.cleanup;
    currentEffect.cleanup = prev ? () => {
      prev();
      fn();
    } : fn;
  }
}
function createScope(fn) {
  const scope = {
    effects: [],
    children: [],
    cleanups: [],
    parent: currentScope
  };
  if (currentScope) currentScope.children.push(scope);
  const prev = currentScope;
  currentScope = scope;
  try {
    fn();
  } finally {
    currentScope = prev;
  }
  return scope;
}
function disposeScope(scope) {
  for (const child of scope.children) disposeScope(child);
  for (const effect of scope.effects) {
    if (effect.cleanup) effect.cleanup();
  }
  for (const fn of scope.cleanups) fn();
  scope.effects.length = 0;
  scope.children.length = 0;
  scope.cleanups.length = 0;
}

// node_modules/@trendr/core/src/element.js
var Fragment = /* @__PURE__ */ Symbol("Fragment");

// node_modules/@trendr/core/src/layout.js
function resolveBorderEdges(style) {
  if (!style.border) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!style.borderEdges) return { top: 1, right: 1, bottom: 1, left: 1 };
  const e = style.borderEdges;
  return {
    top: e.top ? 1 : 0,
    right: e.right ? 1 : 0,
    bottom: e.bottom ? 1 : 0,
    left: e.left ? 1 : 0
  };
}
function computeLayout(node, rect) {
  if (!node) return;
  if (node._resolved) {
    computeLayout(node._resolved, rect);
    node._layout = node._resolved._layout;
    node._availableRect = rect;
    return;
  }
  if (node.type === Fragment) {
    node._layout = rect;
    if (node._resolvedChildren) {
      for (const child of node._resolvedChildren) {
        computeLayout(child, rect);
      }
    }
    return;
  }
  const style = node.props?.style ?? {};
  const absW = typeof style.width === "number" ? style.width : null;
  const absH = typeof style.height === "number" ? style.height : null;
  const box = {
    x: rect.x,
    y: rect.y,
    width: clampSize(absW != null ? Math.min(absW, rect.width) : rect.width, style.minWidth, style.maxWidth),
    height: clampSize(absH != null ? Math.min(absH, rect.height) : rect.height, style.minHeight, style.maxHeight)
  };
  if (node.type === "text") {
    const text = extractText(node);
    if (text) {
      const lines = wordWrap(text, box.width);
      if (style.height == null) box.height = Math.min(lines.length, rect.height);
    } else {
      if (style.height == null) box.height = 1;
    }
    node._layout = box;
    return;
  }
  node._layout = box;
  const children = node._resolvedChildren;
  if (!children || children.length === 0) return;
  const pad = resolvePadding(style);
  const be = resolveBorderEdges(style);
  const innerX = box.x + pad.left + be.left;
  const innerY = box.y + pad.top + be.top;
  const innerW = Math.max(0, box.width - pad.left - pad.right - be.left - be.right);
  const innerH = Math.max(0, box.height - pad.top - pad.bottom - be.top - be.bottom);
  const flowChildren = [];
  const absChildren = [];
  for (const child of children) {
    if (childStyle(child).position === "absolute") absChildren.push(child);
    else flowChildren.push(child);
  }
  const isRow = style.flexDirection === "row";
  const gap = style.gap ?? 0;
  const isScroll = style.overflow === "scroll";
  const flexMain = isScroll ? 1e5 : isRow ? innerW : innerH;
  if (flowChildren.length > 0) {
    layoutFlex(flowChildren, {
      x: innerX,
      y: innerY,
      width: isRow && isScroll ? flexMain : innerW,
      height: !isRow && isScroll ? flexMain : innerH,
      isRow,
      gap,
      justifyContent: style.justifyContent ?? "flex-start",
      alignItems: style.alignItems ?? "stretch"
    });
  }
  if (isScroll && flowChildren.length > 0) {
    let maxEdge = 0;
    for (const child of flowChildren) {
      const cl = getLeaf(child)?._layout;
      if (cl) {
        const edge = isRow ? cl.x + cl.width - innerX : cl.y + cl.height - innerY;
        if (edge > maxEdge) maxEdge = edge;
      }
    }
    node._contentHeight = maxEdge;
  }
  for (const child of absChildren) {
    layoutAbsolute(child, innerX, innerY, innerW, innerH);
  }
}
function layoutAbsolute(child, areaX, areaY, areaW, areaH) {
  const cs = childStyle(child);
  let w, h;
  if (cs.left != null && cs.right != null) {
    w = Math.max(0, areaW - (cs.left ?? 0) - (cs.right ?? 0));
  } else {
    w = resolveSize(cs.width, areaW) ?? measureChild(child, cs, false, areaW, areaH).width;
  }
  if (cs.top != null && cs.bottom != null) {
    h = Math.max(0, areaH - (cs.top ?? 0) - (cs.bottom ?? 0));
  } else {
    h = resolveSize(cs.height, areaH) ?? measureChild(child, cs, false, areaW, areaH).height;
  }
  let x = areaX;
  if (cs.left != null) x = areaX + cs.left;
  else if (cs.right != null) x = areaX + areaW - w - cs.right;
  let y = areaY;
  if (cs.top != null) y = areaY + cs.top;
  else if (cs.bottom != null) y = areaY + areaH - h - cs.bottom;
  computeLayout(child, { x, y, width: Math.max(0, w), height: Math.max(0, h) });
}
function layoutFlex(children, ctx) {
  const { x, y, width, height, isRow, gap, justifyContent, alignItems } = ctx;
  const mainSize = isRow ? width : height;
  const crossSize = isRow ? height : width;
  const totalGaps = Math.max(0, children.length - 1) * gap;
  let usedMain = totalGaps;
  let totalFlex = 0;
  const childInfo = [];
  for (const child of children) {
    const cs = childStyle(child);
    const grow = cs.flexGrow ?? cs.flex ?? 0;
    const margin = resolveMargin(cs);
    const marginMain = isRow ? margin.left + margin.right : margin.top + margin.bottom;
    const marginCross = isRow ? margin.top + margin.bottom : margin.left + margin.right;
    if (grow > 0) {
      const minMain = isRow ? cs.minWidth ?? 0 : cs.minHeight ?? 0;
      usedMain += minMain + marginMain;
      totalFlex += grow;
      childInfo.push({ child, cs, grow, minMain, marginMain, marginCross, margin, measured: null });
    } else {
      const measured = measureChild(child, cs, isRow, width, height);
      const childMain = isRow ? measured.width : measured.height;
      usedMain += childMain + marginMain;
      childInfo.push({ child, cs, grow: 0, minMain: childMain, marginMain, marginCross, margin, measured });
    }
  }
  const remaining = Math.max(0, mainSize - usedMain);
  let mainOffset = 0;
  let spaceBetween = 0;
  if (totalFlex === 0) {
    switch (justifyContent) {
      case "center":
        mainOffset = Math.floor(remaining / 2);
        break;
      case "flex-end":
        mainOffset = remaining;
        break;
      case "space-between":
        spaceBetween = children.length > 1 ? remaining / (children.length - 1) : 0;
        break;
      case "space-around":
        spaceBetween = remaining / children.length;
        mainOffset = Math.floor(spaceBetween / 2);
        break;
    }
  }
  let pos2 = mainOffset;
  for (const info of childInfo) {
    const { child, cs, grow, minMain, marginMain, marginCross, margin, measured } = info;
    let childMain;
    if (grow > 0) {
      const extra = totalFlex > 0 ? Math.floor(remaining * (grow / totalFlex)) : 0;
      childMain = minMain + extra;
    } else {
      childMain = minMain;
    }
    const mainRemaining = mainSize - pos2 - marginMain;
    if (childMain > mainRemaining) childMain = Math.max(0, mainRemaining);
    const explicitCross = isRow ? resolveSize(cs.height, crossSize) : resolveSize(cs.width, crossSize);
    let childCross = crossSize - marginCross;
    if (alignItems !== "stretch" || explicitCross != null) {
      const measuredCross = measured ? isRow ? measured.height : measured.width : childCross;
      childCross = Math.min(measuredCross, childCross);
    }
    const marginBefore = isRow ? margin.left : margin.top;
    const marginCrossBefore = isRow ? margin.top : margin.left;
    let crossOffset = marginCrossBefore;
    switch (alignItems) {
      case "center":
        crossOffset = Math.floor((crossSize - marginCross - childCross) / 2) + marginCrossBefore;
        break;
      case "flex-end":
        crossOffset = crossSize - marginCross - childCross + marginCrossBefore;
        break;
    }
    const childRect = isRow ? { x: x + pos2 + marginBefore, y: y + crossOffset, width: childMain, height: childCross } : { x: x + crossOffset, y: y + pos2 + marginBefore, width: childCross, height: childMain };
    computeLayout(child, childRect);
    pos2 += childMain + marginMain + gap + spaceBetween;
  }
}
function measureChild(child, cs, isRow, availW, availH) {
  const leaf = getLeaf(child);
  if (!leaf) return { width: 0, height: 0 };
  const explicitW = resolveSize(cs.width, availW);
  const explicitH = resolveSize(cs.height, availH);
  let w, h;
  if (leaf.type === "text") {
    const text = extractText(leaf);
    const overflow = cs.overflow;
    if (!text) {
      w = explicitW ?? 0;
      h = explicitH ?? 1;
    } else if (overflow === "nowrap" || overflow === "truncate") {
      w = explicitW ?? Math.min(availW, measureText(text));
      h = explicitH ?? 1;
    } else {
      const maxW = explicitW ?? availW;
      const lines = wordWrap(text, maxW);
      const textWidth = Math.min(maxW, Math.max(...lines.map((l) => measureText(l))));
      w = explicitW ?? textWidth;
      h = explicitH ?? lines.length;
    }
  } else if (explicitW != null && explicitH != null) {
    w = explicitW;
    h = explicitH;
  } else {
    const intrinsic = measureIntrinsic(leaf, availW, availH);
    w = explicitW ?? intrinsic.width;
    h = explicitH ?? intrinsic.height;
  }
  return {
    width: clampSize(w, cs.minWidth, cs.maxWidth),
    height: clampSize(h, cs.minHeight, cs.maxHeight)
  };
}
function measureIntrinsic(node, availW, availH) {
  if (!node) return { width: 0, height: 0 };
  const style = node.props?.style ?? {};
  const pad = resolvePadding(style);
  const be = resolveBorderEdges(style);
  const chrome = { x: pad.left + pad.right + be.left + be.right, y: pad.top + pad.bottom + be.top + be.bottom };
  const innerW = availW - chrome.x;
  const innerH = availH - chrome.y;
  const children = node._resolvedChildren;
  if (!children || children.length === 0) {
    return { width: chrome.x, height: chrome.y };
  }
  const childIsRow = style.flexDirection === "row";
  const gap = style.gap ?? 0;
  let mainTotal = 0;
  let crossMax = 0;
  for (const child of children) {
    const cs = childStyle(child);
    const grow = cs.flexGrow ?? cs.flex ?? 0;
    const measured = measureChild(child, cs, childIsRow, innerW, innerH);
    const margin = resolveMargin(cs);
    const marginMain = childIsRow ? margin.left + margin.right : margin.top + margin.bottom;
    const marginCross = childIsRow ? margin.top + margin.bottom : margin.left + margin.right;
    const childMain = (childIsRow ? measured.width : measured.height) + marginMain;
    mainTotal += childMain;
    const childCross = (childIsRow ? measured.height : measured.width) + marginCross;
    if (childCross > crossMax) crossMax = childCross;
  }
  mainTotal += Math.max(0, children.length - 1) * gap;
  return childIsRow ? { width: mainTotal + chrome.x, height: crossMax + chrome.y } : { width: crossMax + chrome.x, height: mainTotal + chrome.y };
}
function getLeaf(node) {
  if (!node) return null;
  if (node._resolved) return getLeaf(node._resolved);
  return node;
}
function childStyle(child) {
  const leaf = getLeaf(child);
  return leaf?.props?.style ?? {};
}
function resolveSize(value, available) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.endsWith("%")) {
    return Math.floor(available * parseFloat(value) / 100);
  }
  return null;
}
function clampSize(value, min, max) {
  if (min != null && value < min) value = min;
  if (max != null && value > max) value = max;
  return Math.max(0, Math.floor(value));
}
function resolvePadding(style) {
  const p = style.padding ?? 0;
  return {
    top: style.paddingTop ?? style.paddingY ?? p,
    bottom: style.paddingBottom ?? style.paddingY ?? p,
    left: style.paddingLeft ?? style.paddingX ?? p,
    right: style.paddingRight ?? style.paddingX ?? p
  };
}
function resolveMargin(style) {
  const m = style.margin ?? 0;
  return {
    top: style.marginTop ?? style.marginY ?? m,
    bottom: style.marginBottom ?? style.marginY ?? m,
    left: style.marginLeft ?? style.marginX ?? m,
    right: style.marginRight ?? style.marginX ?? m
  };
}
function extractText(node) {
  if (node == null || node === true || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  const children = node.props?.children;
  if (children == null || children === true || children === false) return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((c) => extractText(c)).join("");
  return "";
}

// node_modules/@trendr/core/src/scheduler.js
function createScheduler({ fps = 60, onFrame } = {}) {
  const interval = Math.floor(1e3 / fps);
  let lastFrame = 0;
  let queued = false;
  let running = false;
  let timer = null;
  function tick() {
    queued = false;
    timer = null;
    const now = Date.now();
    const elapsed = now - lastFrame;
    if (elapsed < interval) {
      timer = setTimeout(tick, interval - elapsed);
      queued = true;
      return;
    }
    running = true;
    lastFrame = now;
    onFrame();
    running = false;
  }
  function requestFrame() {
    if (queued || running) return;
    queued = true;
    setImmediate(tick);
  }
  function forceFrame() {
    if (running) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queued = false;
    running = true;
    lastFrame = Date.now();
    onFrame();
    running = false;
  }
  function destroy() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queued = false;
  }
  return { requestFrame, forceFrame, destroy };
}

// node_modules/@trendr/core/src/input.js
var SPECIAL_KEYS = {
  "\x1B[A": "up",
  "\x1B[B": "down",
  "\x1B[C": "right",
  "\x1B[D": "left",
  "\x1B[H": "home",
  "\x1B[F": "end",
  "\x1B[2~": "insert",
  "\x1B[3~": "delete",
  "\x1B[5~": "pageup",
  "\x1B[6~": "pagedown",
  "\x1BOP": "f1",
  "\x1BOQ": "f2",
  "\x1BOR": "f3",
  "\x1BOS": "f4",
  "\x1B[15~": "f5",
  "\x1B[17~": "f6",
  "\x1B[18~": "f7",
  "\x1B[19~": "f8",
  "\x1B[20~": "f9",
  "\x1B[21~": "f10",
  "\x1B[23~": "f11",
  "\x1B[24~": "f12",
  "\r": "return",
  "\n": "return",
  "	": "tab",
  "\x1B[Z": "shift-tab",
  "\x7F": "backspace",
  "\x1B": "escape",
  " ": "space"
};
var MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
function parseMouse(raw) {
  const m = MOUSE_RE.exec(raw);
  if (!m) return null;
  const cb = parseInt(m[1], 10);
  const x = parseInt(m[2], 10) - 1;
  const y = parseInt(m[3], 10) - 1;
  const release = m[4] === "m";
  const button = cb & 3;
  const scroll = (cb & 64) !== 0;
  const motion = (cb & 32) !== 0;
  if (scroll) {
    return { type: "mouse", action: "scroll", direction: button === 0 ? "up" : "down", x, y };
  }
  const buttonName = button === 0 ? "left" : button === 1 ? "middle" : "right";
  const action = release ? "release" : motion ? "drag" : "press";
  return { type: "mouse", action, button: buttonName, x, y };
}
function parseKey(data) {
  const raw = typeof data === "string" ? data : data.toString();
  if (SPECIAL_KEYS[raw]) {
    return { key: SPECIAL_KEYS[raw], ctrl: false, meta: false, shift: false, raw };
  }
  if (raw.length === 1) {
    const code = raw.charCodeAt(0);
    if (code >= 1 && code <= 26) {
      return {
        key: String.fromCharCode(code + 96),
        ctrl: true,
        meta: false,
        shift: false,
        raw
      };
    }
    return { key: raw, ctrl: false, meta: false, shift: false, raw };
  }
  if (raw.startsWith("\x1B") && raw.length === 2) {
    return { key: raw[1], ctrl: false, meta: true, shift: false, raw };
  }
  return { key: raw, ctrl: false, meta: false, shift: false, raw };
}
function splitKeys(data) {
  const raw = typeof data === "string" ? data : data.toString();
  const keys = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\x1B") {
      if (i + 1 < raw.length && raw[i + 1] === "[") {
        let j = i + 2;
        if (j < raw.length && raw[j] === "<") {
          j++;
          while (j < raw.length && (raw[j] >= "0" && raw[j] <= "9" || raw[j] === ";")) j++;
          if (j < raw.length) j++;
          keys.push(raw.slice(i, j));
          i = j;
          continue;
        }
        while (j < raw.length && raw[j] >= "0" && raw[j] <= "9") j++;
        if (j < raw.length && raw[j] === ";") {
          j++;
          while (j < raw.length && raw[j] >= "0" && raw[j] <= "9") j++;
        }
        if (j < raw.length) j++;
        keys.push(raw.slice(i, j));
        i = j;
      } else if (i + 1 < raw.length && raw[i + 1] === "O") {
        const end = Math.min(i + 3, raw.length);
        keys.push(raw.slice(i, end));
        i = end;
      } else if (i + 1 < raw.length) {
        keys.push(raw.slice(i, i + 2));
        i += 2;
      } else {
        keys.push(raw[i]);
        i++;
      }
    } else {
      keys.push(raw[i]);
      i++;
    }
  }
  return keys;
}
function createInputHandler(stream) {
  const keyListeners = /* @__PURE__ */ new Set();
  const mouseListeners = /* @__PURE__ */ new Set();
  function dispatch(keyStr) {
    const mouse = parseMouse(keyStr);
    if (mouse) {
      mouse.stopPropagation = () => {
        mouse._stopped = true;
      };
      const snapshot2 = [...mouseListeners].reverse();
      for (const fn of snapshot2) {
        fn(mouse);
        if (mouse._stopped) break;
      }
      return;
    }
    const event = parseKey(keyStr);
    event.stopPropagation = () => {
      event._stopped = true;
    };
    const snapshot = [...keyListeners].reverse();
    for (const fn of snapshot) {
      fn(event);
      if (event._stopped) break;
    }
  }
  function onData(data) {
    for (const key of splitKeys(data)) {
      dispatch(key);
    }
  }
  let attached = false;
  function attach() {
    if (attached) return;
    attached = true;
    stream.on("data", onData);
  }
  function detach() {
    if (!attached) return;
    attached = false;
    stream.off("data", onData);
  }
  function onKey(fn) {
    keyListeners.add(fn);
    if (keyListeners.size + mouseListeners.size === 1) attach();
    return () => {
      keyListeners.delete(fn);
      if (keyListeners.size + mouseListeners.size === 0) detach();
    };
  }
  function onMouse(fn) {
    mouseListeners.add(fn);
    if (keyListeners.size + mouseListeners.size === 1) attach();
    return () => {
      mouseListeners.delete(fn);
      if (keyListeners.size + mouseListeners.size === 0) detach();
    };
  }
  return { onKey, onMouse, attach, detach };
}

// node_modules/@trendr/core/src/renderer.js
var activeContext = null;
var overlays = [];
var lastFrameStats = { changed: 0, total: 0, bytes: 0, fps: 0 };
var frameTimeWindow = [];
var lastFrameTimestamp = 0;
function getContext() {
  return activeContext;
}
var DEFAULT_THEME = { accent: "cyan" };
function getTheme() {
  return activeContext?.theme ?? DEFAULT_THEME;
}
function getInstanceLayout() {
  if (!currentHookOwner) return { x: 0, y: 0, width: 0, height: 0 };
  if (!currentHookOwner.layout) currentHookOwner.layout = { x: 0, y: 0, width: 0, height: 0 };
  return currentHookOwner.layout;
}
var BORDER_CHARS = {
  single: { tl: "\u250C", tr: "\u2510", bl: "\u2514", br: "\u2518", h: "\u2500", v: "\u2502", tDown: "\u252C", tUp: "\u2534", tRight: "\u251C", tLeft: "\u2524" },
  double: { tl: "\u2554", tr: "\u2557", bl: "\u255A", br: "\u255D", h: "\u2550", v: "\u2551", tDown: "\u2566", tUp: "\u2569", tRight: "\u2560", tLeft: "\u2563" },
  round: { tl: "\u256D", tr: "\u256E", bl: "\u2570", br: "\u256F", h: "\u2500", v: "\u2502", tDown: "\u252C", tUp: "\u2534", tRight: "\u251C", tLeft: "\u2524" },
  bold: { tl: "\u250F", tr: "\u2513", bl: "\u2517", br: "\u251B", h: "\u2501", v: "\u2503", tDown: "\u2533", tUp: "\u253B", tRight: "\u2523", tLeft: "\u252B" }
};
var TEXTURE_PRESETS = {
  "shade-light": "\u2591",
  "shade-medium": "\u2592",
  "shade-heavy": "\u2593",
  "dots": "\xB7",
  "cross": "\u2573",
  "grid": "\u253C",
  "dash": "\u254C"
};
function resolveTexture(texture) {
  if (!texture) return null;
  return TEXTURE_PRESETS[texture] ?? texture;
}
function resolveAttrs(style) {
  let attrs = 0;
  if (style.bold) attrs |= BOLD;
  if (style.dim) attrs |= DIM;
  if (style.italic) attrs |= ITALIC;
  if (style.underline) attrs |= UNDERLINE;
  if (style.inverse) attrs |= INVERSE;
  if (style.strikethrough) attrs |= STRIKETHROUGH;
  return attrs;
}
function paintBorder(buf2, rect, borderStyle, fg, edges) {
  const chars = typeof borderStyle === "string" ? BORDER_CHARS[borderStyle] ?? BORDER_CHARS.single : BORDER_CHARS.single;
  const { x, y, width, height } = rect;
  if (width < 2 || height < 2) return;
  const cell = (ch) => ({ ch, fg: fg ?? null, bg: null, attrs: 0 });
  const { top, right, bottom, left } = edges;
  if (top && left) buf2.cells[y * buf2.width + x] = cell(chars.tl);
  else if (top) buf2.cells[y * buf2.width + x] = cell(chars.h);
  else if (left) buf2.cells[y * buf2.width + x] = cell(chars.v);
  if (top && right) buf2.cells[y * buf2.width + x + width - 1] = cell(chars.tr);
  else if (top) buf2.cells[y * buf2.width + x + width - 1] = cell(chars.h);
  else if (right) buf2.cells[y * buf2.width + x + width - 1] = cell(chars.v);
  if (bottom && left) buf2.cells[(y + height - 1) * buf2.width + x] = cell(chars.bl);
  else if (bottom) buf2.cells[(y + height - 1) * buf2.width + x] = cell(chars.h);
  else if (left) buf2.cells[(y + height - 1) * buf2.width + x] = cell(chars.v);
  if (bottom && right) buf2.cells[(y + height - 1) * buf2.width + x + width - 1] = cell(chars.br);
  else if (bottom) buf2.cells[(y + height - 1) * buf2.width + x + width - 1] = cell(chars.h);
  else if (right) buf2.cells[(y + height - 1) * buf2.width + x + width - 1] = cell(chars.v);
  if (top) for (let col = x + 1; col < x + width - 1; col++)
    buf2.cells[y * buf2.width + col] = cell(chars.h);
  if (bottom) for (let col = x + 1; col < x + width - 1; col++)
    buf2.cells[(y + height - 1) * buf2.width + col] = cell(chars.h);
  if (left) for (let row = y + 1; row < y + height - 1; row++)
    buf2.cells[row * buf2.width + x] = cell(chars.v);
  if (right) for (let row = y + 1; row < y + height - 1; row++)
    buf2.cells[row * buf2.width + x + width - 1] = cell(chars.v);
}
function paintJunctions(buf2, rect, borderStyle, fg, children, edges) {
  if (!children) return;
  const chars = typeof borderStyle === "string" ? BORDER_CHARS[borderStyle] ?? BORDER_CHARS.single : BORDER_CHARS.single;
  const cell = (ch) => ({ ch, fg: fg ?? null, bg: null, attrs: 0 });
  for (const child of children) {
    const leaf = child._resolved ? child._resolved : child;
    const divider = leaf?.props?.style?._divider;
    if (!divider) continue;
    const cl = leaf._layout;
    if (!cl) continue;
    if (divider === "vertical") {
      if (cl.x >= rect.x && cl.x < rect.x + rect.width) {
        if (edges.top) buf2.cells[rect.y * buf2.width + cl.x] = cell(chars.tDown);
        if (edges.bottom) buf2.cells[(rect.y + rect.height - 1) * buf2.width + cl.x] = cell(chars.tUp);
      }
    } else if (divider === "horizontal") {
      if (cl.y >= rect.y && cl.y < rect.y + rect.height) {
        if (edges.left) buf2.cells[cl.y * buf2.width + rect.x] = cell(chars.tRight);
        if (edges.right) buf2.cells[cl.y * buf2.width + rect.x + rect.width - 1] = cell(chars.tLeft);
      }
    }
  }
}
function findContentRect(node) {
  if (!node?._layout) return null;
  const style = node.props?.style ?? {};
  if (style.border) return node._layout;
  if (node.type === "text" || style.bg || style.inverse) return node._layout;
  let bounds = null;
  const merge = (rect) => {
    if (!rect) return;
    if (!bounds) {
      bounds = { ...rect };
      return;
    }
    const r = Math.max(bounds.x + bounds.width, rect.x + rect.width);
    const b = Math.max(bounds.y + bounds.height, rect.y + rect.height);
    bounds.x = Math.min(bounds.x, rect.x);
    bounds.y = Math.min(bounds.y, rect.y);
    bounds.width = r - bounds.x;
    bounds.height = b - bounds.y;
  };
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) merge(findContentRect(child));
  }
  if (node._resolved) merge(findContentRect(node._resolved));
  return bounds;
}
function clearOverlayRect(overlayTree, buf2) {
  const rect = findContentRect(overlayTree);
  if (!rect) return;
  fillRect(buf2, rect.x, rect.y, rect.width, rect.height, " ", null, null, 0);
}
function findScrollContentHeight(node) {
  if (!node) return null;
  if (node._contentHeight != null) return node._contentHeight;
  if (node._resolved) return findScrollContentHeight(node._resolved);
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const h = findScrollContentHeight(child);
      if (h != null) return h;
    }
  }
  return null;
}
function updateOverlayLayouts(node) {
  if (!node) return;
  if (node._instance) {
    const rect = node._availableRect ?? node._layout;
    if (rect) {
      const ch = findScrollContentHeight(node);
      if (!node._instance.layout) node._instance.layout = { x: 0, y: 0, width: 0, height: 0 };
      const target = node._instance.layout;
      target.x = rect.x;
      target.y = rect.y;
      target.width = rect.width;
      target.height = rect.height;
      target.contentHeight = ch;
    }
  }
  if (node._resolved) updateOverlayLayouts(node._resolved);
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) updateOverlayLayouts(child);
  }
}
function clipRect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bot = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, r - x), height: Math.max(0, bot - y) };
}
function propagateDirty(node) {
  if (!node) return false;
  if (node._resolved) {
    const childDirty = propagateDirty(node._resolved);
    const inst = node._instance;
    if (inst) {
      inst._subtreeDirty = inst._dirty || childDirty;
      return inst._subtreeDirty;
    }
    return childDirty;
  }
  if (node._resolvedChildren) {
    let anyDirty = false;
    for (const child of node._resolvedChildren) {
      if (propagateDirty(child)) anyDirty = true;
    }
    return anyDirty;
  }
  return false;
}
function layoutEqual(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function paintTree(node, buf2, clip, offset, prevBuf) {
  if (!node) return;
  if (node._resolved) {
    const inst = node._instance;
    if (prevBuf && inst && !inst._subtreeDirty) {
      const layout2 = node._resolved?._layout ?? node._layout;
      if (layout2 && layoutEqual(layout2, inst._lastLayout)) {
        blitRect(prevBuf, buf2, layout2.x, layout2.y, layout2.width, layout2.height);
        return;
      }
    }
    if (inst) inst._lastLayout = node._resolved?._layout ?? node._layout;
    paintTree(node._resolved, buf2, clip, offset, prevBuf);
    return;
  }
  if (node.type === Fragment) {
    if (node._resolvedChildren) {
      for (const child of node._resolvedChildren) paintTree(child, buf2, clip, offset, prevBuf);
    }
    return;
  }
  const rawLayout = node._layout;
  if (!rawLayout || rawLayout.width <= 0 || rawLayout.height <= 0) return;
  const layout = offset ? { x: rawLayout.x + offset.x, y: rawLayout.y + offset.y, width: rawLayout.width, height: rawLayout.height } : rawLayout;
  const clipped = clip ? clipRect(layout, clip) : layout;
  if (clipped.width <= 0 || clipped.height <= 0) return;
  const style = node.props?.style ?? {};
  const attrs = resolveAttrs(style);
  if (node.type === "text") {
    const text = extractText2(node);
    if (!text) return;
    const truncate = style.overflow === "truncate";
    const wrap = style.overflow !== "nowrap" && !truncate;
    if (wrap) {
      const lines = wordWrap(text, layout.width);
      for (let i = 0; i < lines.length && i < layout.height; i++) {
        const rowY = layout.y + i;
        if (rowY < clipped.y || rowY >= clipped.y + clipped.height) continue;
        writeText(buf2, clipped.x, rowY, lines[i].slice(clipped.x - layout.x), style.color, style.bg, attrs, clipped.width);
      }
    } else {
      let line = text.replace(/\n/g, " ");
      if (truncate && measureText(line) > layout.width && layout.width > 3) {
        line = sliceVisible(line, layout.width - 1) + "\u2026";
      }
      if (layout.y >= clipped.y && layout.y < clipped.y + clipped.height) {
        writeText(buf2, clipped.x, layout.y, line.slice(clipped.x - layout.x), style.color, style.bg, attrs, clipped.width);
      }
    }
    return;
  }
  if (style.bg || style.texture) {
    const ch = resolveTexture(style.texture) ?? " ";
    const fg = style.textureColor ?? null;
    fillRect(buf2, clipped.x, clipped.y, clipped.width, clipped.height, ch, fg, style.bg, 0);
  }
  if (style.border) {
    const edges = resolveBorderEdges(style);
    paintBorder(buf2, layout, style.border, style.borderColor, edges);
    paintJunctions(buf2, layout, style.border, style.borderColor, node._resolvedChildren, edges);
  }
  const childClip = clip ? clipRect(layout, clip) : layout;
  let childOffset = offset;
  if (style.overflow === "scroll") {
    const scrollY = style.scrollOffset ?? 0;
    childOffset = { x: offset?.x ?? 0, y: (offset?.y ?? 0) - scrollY };
  }
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      paintTree(child, buf2, childClip, childOffset, prevBuf);
    }
  }
}
function extractText2(node, parentCtx) {
  if (node == null || node === true || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  const children = node.props?.children;
  if (children == null || children === true || children === false) return "";
  if (typeof children === "string" && !node.props?.style) return children;
  if (typeof children === "number" && !node.props?.style) return String(children);
  const style = node.props?.style;
  const ownAttrs = style ? resolveAttrs(style) : 0;
  const hasOwnStyle = style && (style.color != null || style.bg != null || ownAttrs);
  const myCtx = hasOwnStyle ? {
    fg: style.color ?? parentCtx?.fg ?? null,
    bg: style.bg ?? parentCtx?.bg ?? null,
    attrs: ownAttrs || parentCtx?.attrs || 0
  } : parentCtx || null;
  let inner;
  if (typeof children === "string") inner = children;
  else if (typeof children === "number") inner = String(children);
  else if (Array.isArray(children)) inner = children.map((c) => extractText2(c, myCtx)).join("");
  else inner = "";
  if (parentCtx !== void 0 && hasOwnStyle) {
    const prefix = sgr(myCtx.fg, myCtx.bg, myCtx.attrs);
    const suffix = parentCtx ? sgr(parentCtx.fg, parentCtx.bg, parentCtx.attrs) : sgrReset;
    return prefix + inner + suffix;
  }
  return inner;
}
function flattenChildren(children) {
  if (children == null || children === true || children === false) return [];
  if (!Array.isArray(children)) return [children];
  const result = [];
  for (const child of children) {
    if (child == null || child === true || child === false) continue;
    if (Array.isArray(child)) result.push(...flattenChildren(child));
    else result.push(child);
  }
  return result;
}
var hookIndex = 0;
var currentHookOwner = null;
function startHookTracking(owner) {
  currentHookOwner = owner;
  hookIndex = 0;
  setHookRegistrar(registerHook);
}
function endHookTracking() {
  currentHookOwner = null;
  hookIndex = 0;
  setHookRegistrar(null);
}
function registerHook(setupFn) {
  if (!currentHookOwner) {
    return setupFn();
  }
  const owner = currentHookOwner;
  if (!owner.hooks) owner.hooks = [];
  const idx = hookIndex++;
  if (idx >= owner.hooks.length) {
    const result = setupFn();
    owner.hooks.push(result);
    return result;
  }
  return owner.hooks[idx];
}
function shallowPropsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (k === "children") continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
}
function isInstanceClean(instance, newProps) {
  if (!instance._trackedSignals) return false;
  if (!shallowPropsEqual(instance._lastProps, newProps)) return false;
  const sigs = instance._trackedSignals;
  const vals = instance._signalValues;
  for (let i = 0; i < sigs.length; i++) {
    if (sigs[i]() !== vals[i]) return false;
  }
  return true;
}
function snapshotSignals(instance, signals) {
  instance._trackedSignals = signals;
  instance._signalValues = signals.map((g) => g());
}
function resolveForFrame(element, parent, instances, counters, visited, scope) {
  if (element == null || typeof element === "boolean") return null;
  if (typeof element === "string" || typeof element === "number") {
    return {
      type: "text",
      props: { children: String(element) },
      key: null,
      _parent: parent,
      _layout: null,
      _resolved: null,
      _resolvedChildren: null
    };
  }
  const node = {
    type: element.type,
    props: element.props ?? {},
    key: element.key,
    _parent: parent,
    _layout: null,
    _resolved: null,
    _resolvedChildren: null
  };
  if (typeof element.type === "function") {
    const fn = element.type;
    const counterKey = `${scope}/${fn.name}`;
    const count = counters.get(counterKey) ?? 0;
    counters.set(counterKey, count + 1);
    const instanceKey = element.key != null ? `${scope}/${fn.name}:key:${element.key}` : `${scope}/${fn.name}:${count}`;
    if (visited) visited.add(instanceKey);
    let instance = instances.get(instanceKey);
    if (!instance) {
      let result;
      instance = { scope: null, fn, hooks: [], node: null, layout: null, _dirty: true };
      instances.set(instanceKey, instance);
      instance.scope = createScope(() => {
        startHookTracking(instance);
        startRenderTracking();
        result = fn(element.props ?? {});
        const signals = stopRenderTracking();
        endHookTracking();
        snapshotSignals(instance, signals);
        instance._lastProps = element.props;
      });
      node._resolved = resolveForFrame(result, node, instances, counters, visited, instanceKey);
    } else {
      const clean = isInstanceClean(instance, element.props);
      instance._dirty = !clean;
      startHookTracking(instance);
      startRenderTracking();
      const result = fn(element.props ?? {});
      const signals = stopRenderTracking();
      endHookTracking();
      snapshotSignals(instance, signals);
      instance._lastProps = element.props;
      node._resolved = resolveForFrame(result, node, instances, counters, visited, instanceKey);
    }
    node._instance = instance;
    instance.node = node;
    return node;
  }
  if (element.type === Fragment) {
    const children2 = flattenChildren(element.props?.children);
    node._resolvedChildren = children2.map((c) => resolveForFrame(c, node, instances, counters, visited, scope)).filter(Boolean);
    return node;
  }
  const children = flattenChildren(element.props?.children);
  if (children.length > 0) {
    node._resolvedChildren = children.map((c) => resolveForFrame(c, node, instances, counters, visited, scope)).filter(Boolean);
  }
  return node;
}
function mount(rootComponent, { stream, stdin, title, theme, onExit: onExitCb } = {}) {
  const out = stream ?? process.stdout;
  const inp = stdin ?? process.stdin;
  let width = out.columns ?? 80;
  let height = out.rows ?? 24;
  let prev = createBuffer(width, height);
  let curr = createBuffer(width, height);
  const input = createInputHandler(inp);
  const ctx = { stream: out, input, stdin: inp, theme: { ...DEFAULT_THEME, ...theme } };
  activeContext = ctx;
  const instances = /* @__PURE__ */ new Map();
  let forceFullPaint = false;
  let prevHadOverlays = false;
  function frame() {
    const prevCtx = activeContext;
    activeContext = ctx;
    overlays = [];
    clearBuffer(curr);
    const counters = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    const element = { type: rootComponent, props: {}, key: null };
    const tree = resolveForFrame(element, null, instances, counters, visited, "");
    computeLayout(tree, { x: 0, y: 0, width, height });
    let layoutChanged = false;
    for (const inst of instances.values()) {
      const rect = inst.node?._availableRect ?? inst.node?._layout;
      if (!rect) continue;
      const ch = findScrollContentHeight(inst.node);
      if (!inst.layout) inst.layout = { x: 0, y: 0, width: 0, height: 0 };
      const prev2 = inst.layout;
      if (prev2.width !== rect.width || prev2.height !== rect.height || prev2.contentHeight !== ch) {
        layoutChanged = true;
      }
      prev2.x = rect.x;
      prev2.y = rect.y;
      prev2.width = rect.width;
      prev2.height = rect.height;
      prev2.contentHeight = ch;
    }
    if (layoutChanged) {
      overlays = [];
      counters.clear();
      visited.clear();
      const tree2 = resolveForFrame(element, null, instances, counters, visited, "");
      computeLayout(tree2, { x: 0, y: 0, width, height });
      for (const inst of instances.values()) {
        const rect = inst.node?._availableRect ?? inst.node?._layout;
        if (!rect) continue;
        const ch = findScrollContentHeight(inst.node);
        if (!inst.layout) inst.layout = { x: 0, y: 0, width: 0, height: 0 };
        inst.layout.x = rect.x;
        inst.layout.y = rect.y;
        inst.layout.width = rect.width;
        inst.layout.height = rect.height;
        inst.layout.contentHeight = ch;
        inst._dirty = true;
      }
      propagateDirty(tree2);
      paintTree(tree2, curr, null, null, null);
    } else {
      propagateDirty(tree);
      paintTree(tree, curr, null, null, forceFullPaint || prevHadOverlays ? null : prev);
      forceFullPaint = false;
    }
    const hasOverlays = overlays.length > 0;
    for (const { element: overlayEl, owner, backdrop, fullscreen } of overlays) {
      if (backdrop) dimBuffer(curr);
      const overlayRect = backdrop || fullscreen ? { x: 0, y: 0, width, height } : (() => {
        const anchor = owner.node?._layout ?? owner.layout ?? { x: 0, y: 0, width: 0, height: 0 };
        return { x: anchor.x, y: anchor.y + 1, width: width - anchor.x, height: height - anchor.y - 1 };
      })();
      const overlayTree = resolveForFrame(overlayEl, null, instances, counters, visited, "");
      if (overlayTree) {
        computeLayout(overlayTree, overlayRect);
        updateOverlayLayouts(overlayTree);
        clearOverlayRect(overlayTree, curr);
        paintTree(overlayTree, curr);
      }
    }
    prevHadOverlays = hasOverlays;
    for (const [key, inst] of instances) {
      if (!visited.has(key)) {
        disposeScope(inst.scope);
        instances.delete(key);
      }
    }
    activeContext = prevCtx;
    const { output, changed } = diff(prev, curr);
    if (changed > 0) {
      out.write(hideCursor);
      out.write(output);
    }
    const now = performance.now();
    if (lastFrameTimestamp > 0) {
      frameTimeWindow.push(now - lastFrameTimestamp);
      if (frameTimeWindow.length > 30) frameTimeWindow.shift();
    }
    lastFrameTimestamp = now;
    const avgMs = frameTimeWindow.length > 0 ? frameTimeWindow.reduce((a, b) => a + b, 0) / frameTimeWindow.length : 16.67;
    lastFrameStats = { changed, total: width * height, bytes: output ? Buffer.byteLength(output) : 0, fps: Math.round(1e3 / avgMs) };
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  const scheduler = createScheduler({
    fps: 60,
    onFrame: frame
  });
  setSchedulerHook(scheduler.requestFrame);
  out.write(altScreen + hideCursor + clearScreen + enableMouse + (title ? setTitle(title) : ""));
  if (inp.isTTY && inp.setRawMode) inp.setRawMode(true);
  frame();
  scheduler.requestFrame();
  const onResize = () => {
    width = out.columns ?? 80;
    height = out.rows ?? 24;
    prev = createBuffer(width, height);
    curr = createBuffer(width, height);
    out.write(clearScreen);
    scheduler.forceFrame();
  };
  out.on("resize", onResize);
  input.onKey((event) => {
    if (event.key === "c" && event.ctrl) {
      unmount();
      if (onExitCb) onExitCb();
      else process.exit(0);
    }
  });
  let unmounted = false;
  function unmount() {
    if (unmounted) return;
    unmounted = true;
    scheduler.destroy();
    input.detach();
    out.off("resize", onResize);
    process.off("exit", onExit);
    for (const inst of instances.values()) {
      disposeScope(inst.scope);
    }
    instances.clear();
    out.write(sgrReset + disableMouse + showCursor + exitAltScreen);
    if (inp.isTTY && inp.setRawMode) inp.setRawMode(false);
    activeContext = null;
    setSchedulerHook(null);
  }
  function onExit() {
    unmount();
  }
  process.on("exit", onExit);
  function repaint() {
    prev = createBuffer(width, height);
    curr = createBuffer(width, height);
    forceFullPaint = true;
    out.write(clearScreen);
    scheduler.forceFrame();
  }
  ctx.repaint = repaint;
  return { unmount, repaint, getBuffer: () => prev };
}

// node_modules/@trendr/core/src/hooks.js
function useInput(handler) {
  const ref = registerHook(() => {
    const ctx = getContext();
    if (!ctx) throw new Error("useInput must be called within a mounted component");
    const state = { current: handler };
    const unsub = ctx.input.onKey((event) => state.current(event));
    onCleanup(unsub);
    return state;
  });
  ref.current = handler;
}
function useMouse(handler) {
  const ref = registerHook(() => {
    const ctx = getContext();
    if (!ctx) throw new Error("useMouse must be called within a mounted component");
    const state = { current: handler };
    const unsub = ctx.input.onMouse((event) => state.current(event));
    onCleanup(unsub);
    return state;
  });
  ref.current = handler;
}
function useLayout() {
  return getInstanceLayout();
}
function useTheme() {
  return getTheme();
}
function useScrollDrag({ barX, barY, thumbHeight, trackHeight, maxOffset, scrollOffset, onScroll }) {
  const drag = registerHook(() => ({ active: false, startY: 0, startOffset: 0 }));
  useMouse((event) => {
    if (barX == null || thumbHeight <= 0) return;
    if (event.action === "press" && event.button === "left" && event.x === barX) {
      if (event.y >= barY && event.y < barY + thumbHeight) {
        drag.active = true;
        drag.startY = event.y;
        drag.startOffset = scrollOffset;
        event.stopPropagation();
      }
    }
    if (event.action === "drag" && drag.active) {
      const dy = event.y - drag.startY;
      const travel = Math.max(1, trackHeight - thumbHeight);
      const ratio = maxOffset / travel;
      const newOffset = Math.max(0, Math.min(maxOffset, Math.round(drag.startOffset + dy * ratio)));
      onScroll(newOffset);
      event.stopPropagation();
    }
    if (event.action === "release" && drag.active) {
      drag.active = false;
    }
  });
}

// node_modules/@trendr/core/jsx-runtime.js
function jsx(type, props, key) {
  return { type, props, key: key ?? props?.key ?? null };
}
var jsxs = jsx;

// node_modules/@trendr/core/src/components.js
function Spacer() {
  return jsx("box", { style: { flexGrow: 1 } });
}

// node_modules/@trendr/core/src/list.js
function List({ items, selected: selectedProp, onSelect, renderItem, header, headerHeight = 1, focused = true, interactive = focused, itemHeight = 1, scrollbar = false, stickyHeader = false, gap = 0, scrolloff = 2 }) {
  const { accent = "cyan" } = useTheme();
  const [selectedInternal, setSelectedInternal] = createSignal(0);
  const [scrollState, setScrollState] = createSignal(0);
  const layout = useLayout();
  const selected = selectedProp ?? selectedInternal();
  const setSelected = onSelect ?? setSelectedInternal;
  const viewH = layout.height;
  const contentH = layout.contentHeight ?? 0;
  const headerH = header ? headerHeight : 0;
  const sticky = header && stickyHeader;
  const innerHeaderH = sticky ? 0 : headerH;
  const avgH = !sticky && contentH > 0 && items.length > 0 ? (contentH - headerH) / items.length : itemHeight;
  const scrollViewH = sticky ? viewH - headerH : viewH;
  const scrollContentH = sticky ? items.length * avgH : contentH;
  const maxOffset = Math.max(0, scrollContentH - scrollViewH);
  useInput(({ key, ctrl }) => {
    if (!interactive) return;
    const len = items.length;
    if (len === 0) return;
    const pageItems = viewH > 0 ? Math.max(1, Math.floor(viewH / avgH)) : 10;
    const half = Math.max(1, Math.floor(pageItems / 2));
    if (key === "up" || key === "k") setSelected(Math.max(0, selected - 1));
    else if (key === "down" || key === "j") setSelected(Math.min(len - 1, selected + 1));
    else if (key === "pageup" || ctrl && key === "b") setSelected(Math.max(0, selected - pageItems));
    else if (key === "pagedown" || ctrl && key === "f") setSelected(Math.min(len - 1, selected + pageItems));
    else if (ctrl && key === "u") setSelected(Math.max(0, selected - half));
    else if (ctrl && key === "d") setSelected(Math.min(len - 1, selected + half));
    else if (key === "home" || key === "g") setSelected(0);
    else if (key === "end" || key === "G") setSelected(len - 1);
  });
  useMouse((event) => {
    if (!focused) return;
    const len = items.length;
    if (len === 0) return;
    const { x, y } = event;
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return;
    if (event.action === "scroll") {
      if (event.direction === "up") setSelected(Math.max(0, selected - 1));
      else setSelected(Math.min(len - 1, selected + 1));
      event.stopPropagation();
      return;
    }
    if (event.action === "press" && event.button === "left") {
      const headerOffset = sticky ? headerH : header ? headerH : 0;
      const relY = y - layout.y - headerOffset;
      const idx = Math.floor((relY + scrollOffset) / Math.max(1, avgH));
      if (idx >= 0 && idx < len) {
        setSelected(idx);
        event.stopPropagation();
      }
    }
  });
  const hasBar = scrollbar && scrollViewH > 0 && scrollContentH > scrollViewH;
  const barThumbH = hasBar ? Math.max(1, Math.round(scrollViewH / scrollContentH * scrollViewH)) : 0;
  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + (sticky ? headerH : 0),
    thumbHeight: barThumbH,
    trackHeight: scrollViewH,
    maxOffset,
    scrollOffset: selected * avgH,
    onScroll: (offset) => {
      const idx = Math.round(offset / Math.max(1, avgH));
      setSelected(Math.max(0, Math.min(items.length - 1, idx)));
    }
  });
  const itemTop = selected * avgH + innerHeaderH;
  const itemBottom = itemTop + avgH;
  let scrollOffset = 0;
  if (scrollViewH > 0 && scrollContentH > scrollViewH) {
    const margin = scrolloff * avgH;
    scrollOffset = scrollState();
    if (itemTop - margin < scrollOffset) scrollOffset = itemTop - margin;
    if (itemBottom + margin > scrollOffset + scrollViewH) scrollOffset = itemBottom + margin - scrollViewH;
    scrollOffset = Math.max(0, Math.min(maxOffset, Math.round(scrollOffset)));
    if (scrollOffset !== scrollState()) setScrollState(scrollOffset);
  }
  const scrollChildren = [];
  if (header && !sticky) scrollChildren.push(header);
  for (let i = 0; i < items.length; i++) {
    scrollChildren.push(renderItem(items[i], { selected: i === selected, index: i, focused }));
  }
  const scrollBox = jsx("box", {
    style: {
      flexDirection: "column",
      flexGrow: 1,
      overflow: "scroll",
      scrollOffset,
      gap
    },
    children: scrollChildren
  });
  const list = sticky ? jsxs("box", {
    style: { flexDirection: "column", flexGrow: 1 },
    children: [header, scrollBox]
  }) : scrollBox;
  if (!scrollbar || scrollViewH <= 0 || scrollContentH <= scrollViewH) return list;
  const thumbH = Math.max(1, Math.round(scrollViewH / scrollContentH * scrollViewH));
  const thumbStart = maxOffset > 0 ? Math.round(scrollOffset / maxOffset * (scrollViewH - thumbH)) : 0;
  const barH = sticky ? scrollViewH : viewH;
  const barChildren = [];
  for (let i = 0; i < barH; i++) {
    const isThumb = i >= thumbStart && i < thumbStart + thumbH;
    barChildren.push(
      jsx("text", {
        key: i,
        style: { color: isThumb ? focused ? accent : "gray" : "gray", dim: !isThumb },
        children: isThumb ? "\u2588" : "\u2502"
      })
    );
  }
  const scrollBarCol = jsx("box", {
    style: { width: 1, flexDirection: "column" },
    children: barChildren
  });
  if (sticky) {
    return jsxs("box", {
      style: { flexDirection: "column", flexGrow: 1 },
      children: [
        header,
        jsxs("box", {
          style: { flexDirection: "row", flexGrow: 1, gap: 1 },
          children: [scrollBox, scrollBarCol]
        })
      ]
    });
  }
  return jsxs("box", {
    style: { flexDirection: "row", flexGrow: 1, gap: 1 },
    children: [list, scrollBarCol]
  });
}

// node_modules/@trendr/core/src/scrollable-text.js
function ScrollableText({ content = "", focused = true, scrollOffset: offsetProp, onScroll, width: widthProp, scrollbar = false, wrap = true, thumbChar = "\u2588", trackChar = "\u2502" }) {
  const { accent = "cyan" } = useTheme();
  const [offsetInternal, setOffsetInternal] = createSignal(0);
  const layout = useLayout();
  const offset = offsetProp ?? offsetInternal();
  const setOffset = onScroll ?? setOffsetInternal;
  const rawW = widthProp ?? layout.width;
  const h = layout.height;
  const w = scrollbar ? Math.max(0, rawW - 2) : rawW;
  const lines = wrap && w > 0 ? wordWrap(content, w) : content.split("\n");
  const maxOffset = Math.max(0, lines.length - (h || 1));
  const clamp = (v) => Math.max(0, Math.min(maxOffset, v));
  useInput(({ key, ctrl }) => {
    if (!focused) return;
    if (lines.length === 0) return;
    const pageH = h || 10;
    const half = Math.max(1, Math.floor(pageH / 2));
    if (key === "up" || key === "k") setOffset(clamp(offset - 1));
    else if (key === "down" || key === "j") setOffset(clamp(offset + 1));
    else if (key === "pageup" || ctrl && key === "b") setOffset(clamp(offset - pageH));
    else if (key === "pagedown" || ctrl && key === "f") setOffset(clamp(offset + pageH));
    else if (ctrl && key === "u") setOffset(clamp(offset - half));
    else if (ctrl && key === "d") setOffset(clamp(offset + half));
    else if (key === "home" || key === "g") setOffset(0);
    else if (key === "end" || key === "G") setOffset(maxOffset);
  });
  useMouse((event) => {
    if (!focused) return;
    if (event.action !== "scroll") return;
    if (lines.length <= (h || 1)) return;
    const { x, y } = event;
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return;
    if (event.direction === "up") setOffset(clamp(offset - 3));
    else setOffset(clamp(offset + 3));
    event.stopPropagation();
  });
  const hasBar = scrollbar && h > 0 && lines.length > h;
  const barThumbH = hasBar ? Math.max(1, Math.round(h / lines.length * h)) : 0;
  const barThumbStart = hasBar && maxOffset > 0 ? Math.round(offset / maxOffset * (h - barThumbH)) : 0;
  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + barThumbStart,
    thumbHeight: barThumbH,
    trackHeight: h,
    maxOffset,
    scrollOffset: offset,
    onScroll: (v) => setOffset(clamp(v))
  });
  const visible = lines.slice(offset, h > 0 ? offset + h : void 0);
  const textStyle = wrap ? void 0 : { overflow: "truncate" };
  if (!scrollbar || h <= 0 || lines.length <= h) {
    const children2 = visible.map(
      (line, i) => jsx("text", { key: i, style: textStyle, children: line || " " })
    );
    return jsx("box", { style: { flexDirection: "column", flexGrow: 1 }, children: children2 });
  }
  const thumbH = Math.max(1, Math.round(h / lines.length * h));
  const thumbStart = maxOffset > 0 ? Math.round(offset / maxOffset * (h - thumbH)) : 0;
  const children = visible.map((line, i) => {
    const isThumb = i >= thumbStart && i < thumbStart + thumbH;
    const barChar = isThumb ? thumbChar : trackChar;
    const barColor = isThumb ? focused ? accent : "gray" : "gray";
    return jsx("box", {
      key: i,
      style: { flexDirection: "row", height: 1 },
      children: [
        jsx("text", { style: { flexGrow: 1, ...textStyle }, children: line || " " }),
        jsx("text", { style: { color: barColor, dim: !isThumb }, children: " " + barChar })
      ]
    });
  });
  return jsx("box", { style: { flexDirection: "column", flexGrow: 1 }, children });
}

// node_modules/@trendr/core/src/split-pane.js
var DIVIDER_CHARS = {
  single: { h: "\u2500", v: "\u2502" },
  double: { h: "\u2550", v: "\u2551" },
  round: { h: "\u2500", v: "\u2502" },
  bold: { h: "\u2501", v: "\u2503" }
};
function parseSize(s) {
  if (typeof s === "number") return { type: "fixed", value: s };
  const m = String(s).match(/^(\d*\.?\d+)fr$/);
  return m ? { type: "fr", value: parseFloat(m[1]) } : { type: "fixed", value: parseInt(s) || 0 };
}
function sizeToStyle(size, isRow) {
  const parsed = parseSize(size);
  if (parsed.type === "fixed") return { [isRow ? "width" : "height"]: parsed.value };
  return { flexGrow: parsed.value };
}
function SplitPane({ children, direction = "row", sizes: sizesProp, border = "single", borderColor, borderEdges, style }) {
  const items = Array.isArray(children) ? children.filter((c) => c != null && c !== true && c !== false) : children ? [children] : [];
  const n = items.length;
  if (n === 0) return null;
  const isRow = direction === "row";
  const chars = DIVIDER_CHARS[border] ?? DIVIDER_CHARS.single;
  const sizes = sizesProp ?? items.map(() => "1fr");
  const elements = [];
  for (let i = 0; i < n; i++) {
    elements.push(
      jsx("box", {
        key: `p${i}`,
        style: { ...sizeToStyle(sizes[i] ?? "1fr", isRow), flexDirection: "column" },
        children: items[i]
      })
    );
    if (i < n - 1) {
      elements.push(
        jsx("box", {
          key: `d${i}`,
          style: {
            [isRow ? "width" : "height"]: 1,
            texture: isRow ? chars.v : chars.h,
            textureColor: borderColor,
            _divider: isRow ? "vertical" : "horizontal"
          }
        })
      );
    }
  }
  return jsx("box", {
    style: {
      ...style,
      border: border || void 0,
      borderColor,
      borderEdges,
      flexDirection: isRow ? "row" : "column"
    },
    children: elements
  });
}

// src/monitor/client.js
import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
var SOCK_DIR = path.join(os.homedir(), ".tui-mcp");
var SCAN_MS = 2e3;
function pidFromSock(file) {
  const m = file.match(/^(\d+)\.sock$/);
  return m ? Number(m[1]) : null;
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function connect() {
  const emitter = new EventEmitter();
  const connections = /* @__PURE__ */ new Map();
  let destroyed = false;
  let scanTimer = null;
  function scanAndConnect() {
    if (destroyed) return;
    let files = [];
    try {
      files = fs.readdirSync(SOCK_DIR).filter((f) => f.endsWith(".sock"));
    } catch {
    }
    for (const file of files) {
      const sockPath = path.join(SOCK_DIR, file);
      if (connections.has(sockPath)) continue;
      const pid = pidFromSock(file);
      if (pid && !isProcessAlive(pid)) {
        try {
          fs.unlinkSync(sockPath);
        } catch {
        }
        continue;
      }
      connectOne(sockPath);
    }
    scanTimer = setTimeout(scanAndConnect, SCAN_MS);
  }
  function connectOne(sockPath) {
    let buffer = "";
    const socket = net.createConnection(sockPath);
    connections.set(sockPath, socket);
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        try {
          const msg = JSON.parse(line);
          msg._source = sockPath;
          emitter.emit("message", msg);
        } catch {
        }
      }
    });
    socket.on("error", () => {
      socket.destroy();
    });
    socket.on("close", () => {
      connections.delete(sockPath);
      emitter.emit("server_lost", sockPath);
    });
    socket.on("connect", () => {
      emitter.emit("connected", sockPath);
    });
  }
  scanAndConnect();
  emitter.destroy = () => {
    destroyed = true;
    clearTimeout(scanTimer);
    for (const socket of connections.values()) {
      try {
        socket.destroy();
      } catch {
      }
    }
    connections.clear();
  };
  return emitter;
}

// src/monitor/index.jsx
var CYAN = "#00bcd4";
var DIM2 = "#555555";
function sessionKey(source, sessionId) {
  return `${source}:${sessionId}`;
}
function sourceLabel(source) {
  return (source?.split("/").pop() || "?").replace(/\.sock$/, "");
}
function sortByPid(list) {
  return [...list].sort((a, b) => a.pid - b.pid);
}
function upsertSession(list, session) {
  const next = list.filter((s) => s._key !== session._key);
  next.push(session);
  return sortByPid(next);
}
function App() {
  const [sessions, setSessions] = createSignal([]);
  const [sources, setSources] = createSignal([]);
  const [selected, setSelected] = createSignal(0);
  const [buffers, setBuffers] = createSignal({});
  const [fullscreen, setFullscreen] = createSignal(false);
  const rememberSource = (src) => {
    if (!src) return;
    setSources((prev) => prev.includes(src) ? prev : [...prev, src].sort());
  };
  const forgetSource = (src) => {
    setSources((prev) => prev.filter((s) => s !== src));
  };
  createEffect(() => {
    const client = connect();
    client.on("message", (msg) => {
      const src = msg._source;
      rememberSource(src);
      if (msg.type === "sessions") {
        setSessions((prev) => {
          const other = prev.filter((s) => s._source !== src);
          const incoming = msg.sessions.map((s) => ({ ...s, _source: src, _key: sessionKey(src, s.sessionId) }));
          return sortByPid([...other, ...incoming]);
        });
      }
      if (msg.type === "created") {
        const s = { ...msg.session, _source: src, _key: sessionKey(src, msg.session.sessionId) };
        setSessions((prev) => upsertSession(prev, s));
      }
      if (msg.type === "killed") {
        const key = sessionKey(src, msg.sessionId);
        setSessions((prev) => prev.filter((s) => s._key !== key));
        setBuffers((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      if (msg.type === "exited") {
        const key = sessionKey(src, msg.sessionId);
        setSessions((prev) => prev.map(
          (s) => s._key === key ? { ...s, exited: true, exitCode: msg.exitCode } : s
        ));
      }
      if (msg.type === "buffer") {
        const key = sessionKey(src, msg.sessionId);
        setBuffers((prev) => ({ ...prev, [key]: msg.ansi }));
      }
    });
    client.on("connected", (src) => rememberSource(src));
    client.on("server_lost", (src) => {
      forgetSource(src);
      setSessions((prev) => prev.filter((s) => s._source !== src));
      setBuffers((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(src + ":")) delete next[k];
        }
        return next;
      });
    });
    onCleanup(() => client.destroy());
  });
  useInput(({ key }) => {
    if (key === "q") process.exit(0);
    if (key === "return") setFullscreen((f) => !f);
    if (key === "escape") setFullscreen(false);
  });
  const currentSession = () => sessions()[selected()];
  const currentBuffer = () => {
    const s = currentSession();
    return s ? buffers()[s._key] || "" : "";
  };
  if (sources().length === 0) {
    return /* @__PURE__ */ jsx("box", { style: { padding: 1 }, children: /* @__PURE__ */ jsx("text", { style: { color: DIM2 }, children: "waiting for tui-mcp server..." }) });
  }
  if (fullscreen()) {
    return /* @__PURE__ */ jsxs("box", { style: { flexDirection: "column", height: "100%" }, children: [
      /* @__PURE__ */ jsx(FullscreenHeader, { session: currentSession() }),
      /* @__PURE__ */ jsx("box", { style: { flexGrow: 1 }, children: /* @__PURE__ */ jsx(ScrollableText, { content: currentBuffer() }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(SplitPane, { sizes: [28, "1fr"], border: "single", borderColor: DIM2, style: { height: "100%" }, children: [
    /* @__PURE__ */ jsxs("box", { style: { flexDirection: "column", height: "100%" }, children: [
      /* @__PURE__ */ jsx(SessionHeader, { count: sessions().length, sources: sources() }),
      /* @__PURE__ */ jsx(ServerBar, { sources: sources() }),
      /* @__PURE__ */ jsx("box", { style: { flexGrow: 1 }, children: /* @__PURE__ */ jsx(
        List,
        {
          items: sessions(),
          selected: selected(),
          onSelect: setSelected,
          renderItem: (item, { selected: sel, focused: foc }) => /* @__PURE__ */ jsx(SessionRow, { session: item, selected: sel, focused: foc })
        }
      ) }),
      /* @__PURE__ */ jsx(StatusBar, {})
    ] }),
    /* @__PURE__ */ jsxs("box", { style: { flexDirection: "column", height: "100%" }, children: [
      /* @__PURE__ */ jsx(PreviewHeader, { session: currentSession() }),
      /* @__PURE__ */ jsx("box", { style: { flexGrow: 1 }, children: /* @__PURE__ */ jsx(ScrollableText, { content: currentBuffer() }) })
    ] })
  ] });
}
function SessionHeader({ count, sources }) {
  return /* @__PURE__ */ jsxs("box", { style: { flexDirection: "row", paddingX: 1 }, children: [
    /* @__PURE__ */ jsx("text", { style: { color: CYAN, bold: true }, children: "sessions" }),
    /* @__PURE__ */ jsx(Spacer, {}),
    /* @__PURE__ */ jsxs("text", { style: { color: DIM2 }, children: [
      count,
      " on ",
      sources.length
    ] })
  ] });
}
function ServerBar({ sources }) {
  const label = sources.length > 0 ? sources.map(sourceLabel).join(", ") : "none";
  return /* @__PURE__ */ jsx("box", { style: { flexDirection: "row", paddingX: 1 }, children: /* @__PURE__ */ jsxs("text", { style: { color: DIM2 }, children: [
    "servers ",
    label
  ] }) });
}
function PreviewHeader({ session }) {
  if (!session) return /* @__PURE__ */ jsx("text", { style: { color: DIM2, paddingX: 1 }, children: "no sessions" });
  return /* @__PURE__ */ jsxs("box", { style: { flexDirection: "row", paddingX: 1 }, children: [
    /* @__PURE__ */ jsx("text", { style: { color: CYAN, bold: true }, children: session.command }),
    /* @__PURE__ */ jsx(Spacer, {}),
    /* @__PURE__ */ jsxs("text", { style: { color: DIM2 }, children: [
      "srv ",
      sourceLabel(session._source),
      "  pid ",
      session.pid,
      "  ",
      session.cols,
      "x",
      session.rows
    ] })
  ] });
}
function FullscreenHeader({ session }) {
  if (!session) return /* @__PURE__ */ jsx("text", { style: { color: DIM2 }, children: "no sessions" });
  return /* @__PURE__ */ jsxs("box", { style: { flexDirection: "row", paddingX: 1 }, children: [
    /* @__PURE__ */ jsx("text", { style: { color: CYAN, bold: true }, children: session.command }),
    /* @__PURE__ */ jsx(Spacer, {}),
    /* @__PURE__ */ jsxs("text", { style: { color: DIM2 }, children: [
      "srv ",
      sourceLabel(session._source),
      "  pid ",
      session.pid,
      "  ",
      session.cols,
      "x",
      session.rows,
      "  esc: back"
    ] })
  ] });
}
function SessionRow({ session, selected, focused }) {
  const bg = selected ? focused ? CYAN : "gray" : null;
  const fg = selected ? "black" : null;
  const dot = session.exited ? "o" : "*";
  const dotColor = selected ? "black" : session.exited ? DIM2 : CYAN;
  const cmd = session.command.length > 18 ? session.command.slice(0, 18) + ".." : session.command;
  const pidStr = String(session.pid).padEnd(6);
  return /* @__PURE__ */ jsxs("box", { style: { flexDirection: "row", paddingX: 1, bg }, children: [
    /* @__PURE__ */ jsxs("text", { style: { color: dotColor }, children: [
      dot,
      " "
    ] }),
    /* @__PURE__ */ jsx("text", { style: { color: fg || DIM2 }, children: pidStr }),
    /* @__PURE__ */ jsx("text", { style: { color: fg || "#777777" }, children: sourceLabel(session._source).padEnd(6) }),
    /* @__PURE__ */ jsx("text", { style: { color: fg || "#aaaaaa" }, children: cmd })
  ] });
}
function StatusBar() {
  return /* @__PURE__ */ jsx("box", { style: { flexDirection: "row", paddingX: 1 }, children: /* @__PURE__ */ jsx("text", { style: { color: DIM2 }, children: "j/k nav  enter fullscreen  q quit" }) });
}
mount(App, { title: "tui-mcp monitor" });

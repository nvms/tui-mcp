import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKeys, buildMouseSequence } from '../src/keys.js'

test('plain named keys', () => {
  assert.equal(resolveKeys('Enter'), '\r')
  assert.equal(resolveKeys('Escape'), '\x1b')
  assert.equal(resolveKeys('Tab'), '\t')
  assert.equal(resolveKeys('Backspace'), '\x7f')
  assert.equal(resolveKeys('Up'), '\x1b[A')
  assert.equal(resolveKeys('Space'), ' ')
  assert.equal(resolveKeys('F5'), '\x1b[15~')
})

test('named keys are case-insensitive', () => {
  assert.equal(resolveKeys('enter'), '\r')
  assert.equal(resolveKeys('ESCAPE'), '\x1b')
  assert.equal(resolveKeys('pageup'), '\x1b[5~')
})

test('single characters pass through', () => {
  assert.equal(resolveKeys('q'), 'q')
  assert.equal(resolveKeys(':'), ':')
})

test('ctrl combos', () => {
  assert.equal(resolveKeys('Ctrl+C'), '\x03')
  assert.equal(resolveKeys('Ctrl+a'), '\x01')
  assert.equal(resolveKeys('Ctrl+Space'), '\x00')
  assert.equal(resolveKeys('Ctrl+['), '\x1b')
})

test('alt combos prefix escape', () => {
  assert.equal(resolveKeys('Alt+x'), '\x1bx')
  assert.equal(resolveKeys('Ctrl+Alt+c'), '\x1b\x03')
})

test('shift uppercases single characters', () => {
  assert.equal(resolveKeys('Shift+a'), 'A')
})

test('shift+tab is reverse tab', () => {
  assert.equal(resolveKeys('Shift+Tab'), '\x1b[Z')
})

test('modified navigation keys use CSI encoding', () => {
  assert.equal(resolveKeys('Shift+Up'), '\x1b[1;2A')
  assert.equal(resolveKeys('Ctrl+Up'), '\x1b[1;5A')
  assert.equal(resolveKeys('Ctrl+Left'), '\x1b[1;5D')
  assert.equal(resolveKeys('Alt+Right'), '\x1b[1;3C')
  assert.equal(resolveKeys('Ctrl+Shift+Down'), '\x1b[1;6B')
  assert.equal(resolveKeys('Ctrl+Home'), '\x1b[1;5H')
})

test('modified tilde keys keep their code', () => {
  assert.equal(resolveKeys('Ctrl+Delete'), '\x1b[3;5~')
  assert.equal(resolveKeys('Shift+PageUp'), '\x1b[5;2~')
  assert.equal(resolveKeys('Ctrl+F5'), '\x1b[15;5~')
})

test('literal plus', () => {
  assert.equal(resolveKeys('+'), '+')
  assert.equal(resolveKeys('Alt++'), '\x1b+')
  assert.equal(resolveKeys('Shift++'), '+')
})

test('mouse sequences use SGR encoding', () => {
  assert.equal(buildMouseSequence('press', 4, 9), '\x1b[<0;5;10M')
  assert.equal(buildMouseSequence('release', 4, 9, 'right'), '\x1b[<2;5;10m')
  assert.equal(buildMouseSequence('scroll', 0, 0, 'up'), '\x1b[<64;1;1M')
})

test('kitty keyboard protocol: ambiguous keys use CSI u when the app enabled it', () => {
  const kitty = { kittyFlags: 1 }
  assert.equal(resolveKeys('Ctrl+Space', kitty), '\x1b[32;5u')
  assert.equal(resolveKeys('Ctrl+C', kitty), '\x1b[99;5u')
  assert.equal(resolveKeys('Ctrl+Shift+a', kitty), '\x1b[97;6u')
  assert.equal(resolveKeys('Alt+x', kitty), '\x1b[120;3u')
  assert.equal(resolveKeys('Escape', kitty), '\x1b[27u')
  assert.equal(resolveKeys('Shift+Enter', kitty), '\x1b[13;2u')
  assert.equal(resolveKeys('Shift+Tab', kitty), '\x1b[9;2u')
  assert.equal(resolveKeys('NumpadEnter', kitty), '\x1b[57414u')
})

test('kitty keyboard protocol: unambiguous keys keep their legacy bytes', () => {
  const kitty = { kittyFlags: 1 }
  assert.equal(resolveKeys('Enter', kitty), '\r')
  assert.equal(resolveKeys('Tab', kitty), '\t')
  assert.equal(resolveKeys('Backspace', kitty), '\x7f')
  assert.equal(resolveKeys('Up', kitty), '\x1b[A')
  assert.equal(resolveKeys('Ctrl+Up', kitty), '\x1b[1;5A')
  assert.equal(resolveKeys('Shift+a', kitty), 'A')
  assert.equal(resolveKeys('q', kitty), 'q')
})

test('without the protocol, keys are unchanged', () => {
  assert.equal(resolveKeys('Ctrl+Space'), '\x00')
  assert.equal(resolveKeys('Escape', { kittyFlags: 0 }), '\x1b')
  assert.equal(resolveKeys('NumpadEnter'), '\r')
})

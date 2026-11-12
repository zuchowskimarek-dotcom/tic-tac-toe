// T-1 to T-7 of TP-TIC-TAC-TOE-001: the rules, the computer player and the counting rule.
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../game.js')

// Builds a state from a board written as 9 characters, X, O or '.', with the side to move.
function at (cells, next) {
  const board = cells.split('').map((c) => (c === '.' ? null : c))
  const won = T.winner(board)
  const full = board.every((c) => c !== null)
  return { board, next, result: won || (full ? { draw: true } : null) }
}

test('T-1 turns alternate, starting with X, and play leaves its input unchanged', () => {
  let state = T.newGame()
  assert.equal(state.next, 'X')
  for (const [cell, mover] of [[4, 'X'], [0, 'O'], [8, 'X']]) {
    const before = structuredClone(state)
    const after = T.play(state, cell)
    assert.equal(after.board[cell], mover)
    assert.equal(after.next, mover === 'X' ? 'O' : 'X')
    assert.deepStrictEqual(state, before)
    state = after
  }
})

test('T-2 refused moves return the very state they were given, unchanged', () => {
  const running = T.play(T.newGame(), 4)
  const won = at('XXXOO....', 'O')
  for (const [state, cell] of [[running, 4], [won, 5], [running, -1], [running, 9], [running, 2.5]]) {
    const before = structuredClone(state)
    assert.equal(T.play(state, cell), state)
    assert.deepStrictEqual(state, before)
  }
})

test('T-3 LINES holds exactly the 8 lines, and every line wins for each mark', () => {
  const expected = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
  const norm = (lines) => lines.map((l) => l.slice().sort((a, b) => a - b).join()).sort()
  assert.deepStrictEqual(norm(T.LINES), norm(expected))
  let wins = 0
  for (const line of expected) {
    for (const mark of ['X', 'O']) {
      const board = Array(9).fill(null)
      for (const i of line) board[i] = mark
      assert.deepStrictEqual(T.winner(board), { winner: mark, line })
      wins += 1
    }
  }
  assert.equal(wins, 16)
})

test('T-4 a full board with no line is a draw, a ninth move that completes a line wins', () => {
  let state = T.newGame()
  for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8]) state = T.play(state, cell)
  assert.deepStrictEqual(state.result, { draw: true })
  let win = T.newGame()
  for (const cell of [1, 0, 3, 2, 6, 4, 7, 5, 8]) win = T.play(win, cell)
  assert.equal(win.board.every((c) => c !== null), true)
  assert.equal(win.result.winner, 'X')
  for (const cells of ['.........', 'X...O....', 'XOXXOOOXX']) {
    assert.equal(T.winner(at(cells, 'X').board), null)
  }
})

test('T-5 the computer never loses: every game against every sequence of X moves', () => {
  const ends = { O: 0, draw: 0, X: 0 }
  function person (state) {
    for (let cell = 0; cell < 9; cell += 1) {
      const afterX = T.play(state, cell)
      if (afterX === state) continue
      if (afterX.result !== null) { finish(afterX); continue }
      const afterO = T.play(afterX, T.bestMove(afterX))
      assert.notEqual(afterO, afterX, 'the computer always finds a move')
      if (afterO.result !== null) finish(afterO)
      else person(afterO)
    }
  }
  function finish (state) {
    if (state.result.draw) ends.draw += 1
    else ends[state.result.winner] += 1
  }
  person(T.newGame())
  assert.equal(ends.X, 0, 'no game ends in a win for X')
  assert.equal(ends.O + ends.draw, 569, 'the count the tie rule of ARCH D4 fixes')
})

test('T-6 the computer takes a win, blocks a loss, and wins where both sides threaten', () => {
  assert.equal(T.bestMove(at('O.XXO..X.', 'O')), 8)
  assert.equal(T.bestMove(at('XX..O....', 'O')), 2)
  assert.equal(T.bestMove(at('XX.OO.X..', 'O')), 5)
})

test('T-7 the counting rule adds 1 to the count each finished game earned', () => {
  let score = T.newScore()
  assert.deepStrictEqual(score, { X: 0, O: 0, draws: 0 })
  score = T.addResult(score, at('XXXOO....', 'O'))
  assert.deepStrictEqual(score, { X: 1, O: 0, draws: 0 })
  score = T.addResult(score, at('OOOXX.X..', 'X'))
  assert.deepStrictEqual(score, { X: 1, O: 1, draws: 0 })
  score = T.addResult(score, at('XOXXOOOXX', 'O'))
  assert.deepStrictEqual(score, { X: 1, O: 1, draws: 1 })
  const running = T.play(T.newGame(), 0)
  assert.equal(T.addResult(score, running), score)
})

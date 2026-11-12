// The rules of Tic-Tac-Toe, the computer player and the session score, as plain functions.
// Loads in the page as a classic script (globalThis.TicTacToe) and in Node as a module.
(function (root) {
  'use strict'

  // The 8 lines that win: 3 rows, 3 columns, 2 diagonals, as cell indices 0 to 8.
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]

  // Returns the state of an empty board with X to move.
  function newGame () {
    return { board: [null, null, null, null, null, null, null, null, null], next: 'X', result: null }
  }

  // Takes a board of 9 cells; returns { winner, line } for a filled line, or null.
  function winner (board) {
    for (var i = 0; i < LINES.length; i += 1) {
      var a = LINES[i][0]
      var b = LINES[i][1]
      var c = LINES[i][2]
      if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
        return { winner: board[a], line: [a, b, c] }
      }
    }
    return null
  }

  // Takes a board; returns its result: a win, { draw: true } for a full board, or null.
  function resultOf (board) {
    var won = winner(board)
    if (won) return won
    for (var i = 0; i < 9; i += 1) if (board[i] === null) return null
    return { draw: true }
  }

  // Takes a state and a cell; returns a new state with the move made, or the same state
  // where it refuses the move: a finished game, a filled cell, or a cell outside 0 to 8.
  function play (state, cell) {
    if (state.result !== null) return state
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return state
    if (state.board[cell] !== null) return state
    var board = state.board.slice()
    board[cell] = state.next
    return { board: board, next: state.next === 'X' ? 'O' : 'X', result: resultOf(board) }
  }

  // Scores a state for the side `me` by searching every move to the end of the game:
  // a win 10 minus the depth, a loss the depth minus 10, a draw 0.
  function score (state, me, depth) {
    if (state.result !== null) {
      if (state.result.draw) return 0
      return state.result.winner === me ? 10 - depth : depth - 10
    }
    var mine = state.next === me
    var best = mine ? -Infinity : Infinity
    for (var cell = 0; cell < 9; cell += 1) {
      if (state.board[cell] !== null) continue
      var s = score(play(state, cell), me, depth + 1)
      best = mine ? Math.max(best, s) : Math.min(best, s)
    }
    return best
  }

  // Returns the cell the side to move should play, the lowest cell among equal scores,
  // or -1 where the game is over.
  function bestMove (state) {
    if (state.result !== null) return -1
    var me = state.next
    var best = -Infinity
    var bestCell = -1
    for (var cell = 0; cell < 9; cell += 1) {
      if (state.board[cell] !== null) continue
      var s = score(play(state, cell), me, 1)
      if (s > best) {
        best = s
        bestCell = cell
      }
    }
    return bestCell
  }

  // Returns the score of a new session: no wins and no draws.
  function newScore () {
    return { X: 0, O: 0, draws: 0 }
  }

  // Takes a score and a state; returns the score with 1 added to the count the finished
  // game earned, or the same score for a game still running.
  function addResult (current, state) {
    if (state.result === null) return current
    var next = { X: current.X, O: current.O, draws: current.draws }
    if (state.result.draw) next.draws += 1
    else next[state.result.winner] += 1
    return next
  }

  var api = {
    LINES: LINES,
    newGame: newGame,
    play: play,
    winner: winner,
    bestMove: bestMove,
    newScore: newScore,
    addResult: addResult
  }

  root.TicTacToe = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)

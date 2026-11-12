// The page of the game: the mode switch, the board, the status line, the score and New game.
// Reads the rules from window.TicTacToe; keeps the score in memory for the open page only.
(function () {
  'use strict'

  var T = window.TicTacToe
  var mode = 'two'
  var state = T.newGame()
  var score = T.newScore()

  var cells = Array.prototype.slice.call(document.querySelectorAll('#board .cell'))
  var statusLine = document.getElementById('status')

  // Returns the status text for the current mode and state.
  function statusText () {
    var r = state.result
    if (mode === 'computer') {
      if (r === null) return 'Your turn (X)'
      if (r.draw) return 'Draw!'
      return r.winner === 'X' ? 'You win!' : 'Computer wins!'
    }
    if (r === null) return state.next + "'s turn"
    if (r.draw) return 'Draw!'
    return r.winner + ' wins!'
  }

  // Draws the whole page from mode, state and score.
  function render () {
    var line = state.result && state.result.line ? state.result.line : []
    cells.forEach(function (cell, i) {
      var mark = state.board[i]
      cell.textContent = mark || ''
      cell.setAttribute('aria-label', 'Row ' + (Math.floor(i / 3) + 1) + ', column ' + (i % 3 + 1) + (mark ? ', ' + mark : ''))
      cell.className = 'cell' + (mark ? ' ' + mark.toLowerCase() : '') + (line.indexOf(i) >= 0 ? ' win' : '')
    })
    statusLine.textContent = statusText()
    document.getElementById('mode-two').setAttribute('aria-pressed', String(mode === 'two'))
    document.getElementById('mode-computer').setAttribute('aria-pressed', String(mode === 'computer'))
    document.getElementById('label-x').textContent = mode === 'computer' ? 'You (X)' : 'X wins'
    document.getElementById('label-o').textContent = mode === 'computer' ? 'Computer (O)' : 'O wins'
    document.getElementById('score-x').textContent = String(score.X)
    document.getElementById('score-o').textContent = String(score.O)
    document.getElementById('score-draws').textContent = String(score.draws)
  }

  // Applies a click on a cell: the person's move, then the computer's answer where the
  // mode asks for one; a refused move changes nothing, and a finished game counts once.
  function onCell (i) {
    var after = T.play(state, i)
    if (after === state) return
    state = after
    if (mode === 'computer' && state.result === null) state = T.play(state, T.bestMove(state))
    if (state.result !== null) score = T.addResult(score, state)
    render()
  }

  // Switches to the other mode, which starts a new game and a new score; the mode already
  // selected changes nothing.
  function onMode (next) {
    if (next === mode) return
    mode = next
    state = T.newGame()
    score = T.newScore()
    render()
  }

  cells.forEach(function (cell, i) {
    cell.addEventListener('click', function () { onCell(i) })
  })
  document.getElementById('mode-two').addEventListener('click', function () { onMode('two') })
  document.getElementById('mode-computer').addEventListener('click', function () { onMode('computer') })
  document.getElementById('new-game').addEventListener('click', function () {
    state = T.newGame()
    render()
  })

  render()
})()

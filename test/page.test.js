// T-9 of TP-TIC-TAC-TOE-001: the real page in headless Chrome, opened from disk.
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { launch } = require('../tools/chrome.js')

const root = path.join(__dirname, '..')
const fileUrl = (name) => pathToFileURL(path.join(root, name)).href

// The texts SPEC-TIC-TAC-TOE-001 lists, per mode, beside the marks and the digits of the counts.
const ALWAYS = ['Tic-Tac-Toe', 'Two players', 'Versus computer', 'New game', 'Draws']
const TEXTS = {
  two: ALWAYS.concat(["X's turn", "O's turn", 'X wins!', 'O wins!', 'Draw!', 'X wins', 'O wins']),
  computer: ALWAYS.concat(['Your turn (X)', 'You win!', 'Computer wins!', 'Draw!', 'You (X)', 'Computer (O)'])
}

// One expression that reads everything the test judges from the page.
const READ = `(() => {
  const texts = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) {
    const t = walk.currentNode.textContent.trim()
    const el = walk.currentNode.parentElement
    if (t && el && el.offsetParent !== null) texts.push(t)
  }
  const cells = [...document.querySelectorAll('#board .cell')]
  return {
    mode: document.getElementById('mode-two').getAttribute('aria-pressed') === 'true' ? 'two'
      : document.getElementById('mode-computer').getAttribute('aria-pressed') === 'true' ? 'computer' : 'none',
    status: document.getElementById('status').textContent,
    marks: cells.map((c) => c.textContent || '.').join(''),
    win: cells.filter((c) => c.classList.contains('win')).map((c) => Number(c.dataset.cell)),
    labels: ['label-x', 'label-draws', 'label-o'].map((id) => document.getElementById(id).textContent),
    counts: ['score-x', 'score-draws', 'score-o'].map((id) => Number(document.getElementById(id).textContent)),
    ariaLabels: cells.map((c) => c.getAttribute('aria-label') || ''),
    texts
  }
})()`

test('T-9 the real page plays both modes, keeps the session score and fetches nothing', { timeout: 120000 }, async () => {
  const chrome = await launch()
  try {
    const page = chrome.evaluate
    const read = () => page(READ)
    const click = (selector) => page(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const cell = (i) => click(`#board .cell[data-cell="${i}"]`)
    const english = (s) => {
      for (const t of s.texts) {
        assert.ok(TEXTS[s.mode].includes(t) || /^[XO]$/.test(t) || /^\d+$/.test(t), 'a text outside the SPEC list for ' + s.mode + ': ' + t)
      }
    }

    await chrome.open(fileUrl('index.html'))

    // 1. On opening.
    let s = await read()
    assert.equal(s.mode, 'two')
    assert.equal(s.marks, '.........')
    assert.equal(s.status, "X's turn")
    assert.deepStrictEqual(s.labels, ['X wins', 'Draws', 'O wins'])
    assert.deepStrictEqual(s.counts, [0, 0, 0])
    assert.equal(s.ariaLabels.filter((a) => a.length > 0).length, 9)
    english(s)

    // 2. A two-player game to a win for X; a further click changes nothing.
    for (const i of [0, 3, 1, 4, 2]) await cell(i)
    s = await read()
    assert.equal(s.status, 'X wins!')
    assert.deepStrictEqual(s.win, [0, 1, 2])
    assert.deepStrictEqual(s.counts, [1, 0, 0])
    english(s)
    const afterWin = s
    await cell(5)
    s = await read()
    assert.equal(s.marks, afterWin.marks)
    assert.deepStrictEqual(s.counts, afterWin.counts)

    // 3. New game, then a two-player game to a draw.
    await click('#new-game')
    s = await read()
    assert.equal(s.marks, '.........')
    assert.equal(s.status, "X's turn")
    for (const i of [0, 1, 2, 4, 3, 5, 7]) await cell(i)
    s = await read()
    assert.equal(s.status, "O's turn")
    english(s)
    for (const i of [6, 8]) await cell(i)
    s = await read()
    assert.equal(s.status, 'Draw!')
    assert.deepStrictEqual(s.counts, [1, 1, 0])
    english(s)

    // 4. Pressing Two players again changes nothing.
    const beforeRepeat = s
    await click('#mode-two')
    s = await read()
    assert.equal(s.marks, beforeRepeat.marks)
    assert.deepStrictEqual(s.counts, beforeRepeat.counts)

    // 5. Switching to Versus computer.
    await click('#mode-computer')
    s = await read()
    assert.equal(s.mode, 'computer')
    assert.equal(s.marks, '.........')
    assert.equal(s.status, 'Your turn (X)')
    assert.deepStrictEqual(s.labels, ['You (X)', 'Draws', 'Computer (O)'])
    assert.deepStrictEqual(s.counts, [0, 0, 0])
    english(s)

    // 6. One click shows the person's X and the computer's O together.
    await cell(0)
    s = await read()
    assert.equal(s.marks[0], 'X')
    assert.equal([...s.marks].filter((m) => m === 'X').length, 1)
    assert.equal([...s.marks].filter((m) => m === 'O').length, 1)

    // 7. A click on a filled cell changes nothing.
    const filled = s
    const oCell = s.marks.indexOf('O')
    await cell(oCell)
    await cell(0)
    s = await read()
    assert.equal(s.marks, filled.marks)
    assert.deepStrictEqual(s.counts, filled.counts)

    // 8. Playing on to the end: the computer wins or draws; a further click changes nothing.
    for (let guard = 0; guard < 9; guard += 1) {
      s = await read()
      if (s.status !== 'Your turn (X)') break
      await cell(s.marks.indexOf('.'))
    }
    s = await read()
    assert.ok(['Computer wins!', 'Draw!'].includes(s.status), 'the game ended as ' + s.status)
    assert.equal(s.counts.reduce((a, b) => a + b, 0), 1)
    assert.equal(s.counts[0], 0, 'the person never wins')
    english(s)
    const ended = s
    const free = s.marks.indexOf('.')
    if (free >= 0) await cell(free)
    await cell(0)
    s = await read()
    assert.equal(s.marks, ended.marks)
    assert.deepStrictEqual(s.counts, ended.counts)

    // 9. New game keeps the counts.
    await click('#new-game')
    s = await read()
    assert.equal(s.marks, '.........')
    assert.deepStrictEqual(s.counts, ended.counts)

    // 10. Reloading the page while a count is above 0 starts a new session.
    await chrome.reload()
    s = await read()
    assert.equal(s.mode, 'two')
    assert.deepStrictEqual(s.counts, [0, 0, 0])
    english(s)

    const expected = ['index.html', 'style.css', 'game.js', 'ui.js'].map(fileUrl)
    assert.deepStrictEqual(chrome.requests.slice().sort(), expected.concat(expected).sort())
    assert.deepStrictEqual(chrome.errors, [])
  } finally {
    await chrome.close()
  }
})

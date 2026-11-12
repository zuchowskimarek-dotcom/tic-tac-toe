// Plays the real page in headless Chrome, opened from disk, and reads what a person sees.
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')
const os = require('node:os')
const { launch, removeFolder, findChrome } = require('../tools/chrome.js')

// Runs fn with fs.rmSync replaced by a stand-in that throws the next code of `codes` on each call,
// repeating the last code once the list runs out (null calls the real one), and always restores the
// real fs.rmSync; returns the number of calls the stand-in took.
async function withRmSync (codes, fn) {
  const real = fs.rmSync
  let calls = 0
  fs.rmSync = function (p, o) {
    const code = calls < codes.length ? codes[calls] : codes[codes.length - 1]
    calls += 1
    if (code) {
      const err = new Error(code + ': stand-in failure')
      err.code = code
      throw err
    }
    return real.call(fs, p, o)
  }
  try {
    await fn()
  } finally {
    fs.rmSync = real
  }
  return calls
}

const root = path.join(__dirname, '..')
const fileUrl = (name) => pathToFileURL(path.join(root, name)).href

// The texts the page may show in each mode, beside the marks and the digits of the counts.
const ALWAYS = ['Tic-Tac-Toe', 'Two players', 'Versus computer', 'New game', 'Draws']
const TEXTS = {
  two: ALWAYS.concat(["X's turn", "O's turn", 'X wins!', 'O wins!', 'Draw!', 'X wins', 'O wins']),
  computer: ALWAYS.concat(['Your turn (X)', 'You win!', 'Computer wins!', 'Draw!', 'You (X)', 'Computer (O)'])
}
const LABELS = { two: ['X wins', 'Draws', 'O wins'], computer: ['You (X)', 'Draws', 'Computer (O)'] }

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
    pressed: ['mode-two', 'mode-computer'].map((id) => document.getElementById(id).getAttribute('aria-pressed')),
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
    const read = () => chrome.evaluate(READ)
    const click = (selector) => chrome.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const cell = (i) => click(`#board .cell[data-cell="${i}"]`)

    // Reads the page and asserts what every step shares, then the step's own expectations.
    async function check (mode, expect) {
      const s = await read()
      assert.deepStrictEqual(s.pressed, mode === 'two' ? ['true', 'false'] : ['false', 'true'], 'exactly the mode ' + mode + ' is pressed')
      assert.deepStrictEqual(s.labels, LABELS[mode])
      assert.equal(s.ariaLabels.filter((a) => /^Row [1-3], column [1-3](, [XO])?$/.test(a)).length, 9)
      for (const t of s.texts) {
        assert.ok(TEXTS[mode].includes(t) || /^[XO]$/.test(t) || /^\d+$/.test(t), 'a text outside the list for ' + mode + ': ' + t)
      }
      for (const [key, value] of Object.entries(expect)) assert.deepStrictEqual(s[key], value, key)
      return s
    }

    await chrome.open(fileUrl('index.html'))

    // 1. On opening.
    await check('two', { marks: '.........', status: "X's turn", counts: [0, 0, 0], win: [] })

    // 2. A two-player game to a win for X; a further click changes nothing.
    for (const i of [0, 3, 1, 4, 2]) await cell(i)
    const won = await check('two', { status: 'X wins!', win: [0, 1, 2], counts: [1, 0, 0] })
    await cell(5)
    await check('two', { marks: won.marks, status: 'X wins!', win: [0, 1, 2], counts: [1, 0, 0] })

    // 3. New game, then a two-player game to a draw.
    await click('#new-game')
    await check('two', { marks: '.........', status: "X's turn", win: [], counts: [1, 0, 0] })
    for (const i of [0, 1, 2, 4, 3, 5, 7]) await cell(i)
    await check('two', { status: "O's turn", win: [] })
    for (const i of [6, 8]) await cell(i)
    const drawn = await check('two', { status: 'Draw!', win: [], counts: [1, 1, 0] })

    // 4. Pressing Two players again changes nothing.
    await click('#mode-two')
    await check('two', { marks: drawn.marks, status: 'Draw!', counts: [1, 1, 0] })

    // 5. Switching to Versus computer.
    await click('#mode-computer')
    await check('computer', { marks: '.........', status: 'Your turn (X)', counts: [0, 0, 0], win: [] })

    // 6. One click shows the person's X and the computer's O together, inside that click.
    const marksAfterClick = await chrome.evaluate(`(() => {
      document.querySelector('#board .cell[data-cell="0"]').click()
      return [...document.querySelectorAll('#board .cell')].map((c) => c.textContent || '.').join('')
    })()`)
    assert.equal(marksAfterClick[0], 'X')
    assert.equal([...marksAfterClick].filter((m) => m === 'X').length, 1)
    assert.equal([...marksAfterClick].filter((m) => m === 'O').length, 1)
    const afterFirst = await check('computer', { marks: marksAfterClick, status: 'Your turn (X)', counts: [0, 0, 0] })

    // 7. A click on a filled cell changes nothing.
    await cell(afterFirst.marks.indexOf('O'))
    await cell(0)
    await check('computer', { marks: afterFirst.marks, status: 'Your turn (X)', counts: [0, 0, 0] })

    // 8. Playing on to the end: the computer wins or draws; a further click changes nothing.
    let s = afterFirst
    for (let guard = 0; guard < 9 && s.status === 'Your turn (X)'; guard += 1) {
      await cell(s.marks.indexOf('.'))
      s = await check('computer', {})
    }
    assert.ok(['Computer wins!', 'Draw!'].includes(s.status), 'the game ended as ' + s.status)
    assert.equal(s.counts.reduce((a, b) => a + b, 0), 1)
    assert.equal(s.counts[0], 0, 'the person never wins')
    assert.equal(s.win.length, s.status === 'Draw!' ? 0 : 3)
    const ended = s
    if (ended.marks.indexOf('.') >= 0) await cell(ended.marks.indexOf('.'))
    await cell(0)
    await check('computer', { marks: ended.marks, status: ended.status, counts: ended.counts, win: ended.win })

    // 9. New game keeps the mode and the counts.
    await click('#new-game')
    await check('computer', { marks: '.........', status: 'Your turn (X)', counts: ended.counts, win: [] })

    // 10. Reloading the page while a count is above 0 starts a new session.
    await chrome.reload()
    await check('two', { marks: '.........', status: "X's turn", counts: [0, 0, 0], win: [] })

    const expected = ['index.html', 'style.css', 'game.js', 'ui.js'].map(fileUrl)
    assert.deepStrictEqual(chrome.requests.slice().sort(), expected.concat(expected).sort())
    assert.deepStrictEqual(chrome.errors, [])
  } finally {
    await chrome.close()
  }
})

test('TC-R2 removeFolder retries a folder another process still writes into, and only then', async () => {
  for (const codes of [['ENOTEMPTY', 'ENOTEMPTY', null], ['EBUSY', null], ['EPERM', null]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-remove-'))
    try {
      const calls = await withRmSync(codes, () => removeFolder(dir))
      assert.equal(calls, codes.length, 'tries for ' + codes.join(','))
      assert.equal(fs.existsSync(dir), false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  const kept = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-remove-'))
  try {
    let caught = null
    const started = Date.now()
    const calls = await withRmSync(['ENOTEMPTY'], () => removeFolder(kept).catch((err) => { caught = err }))
    const waited = Date.now() - started
    assert.equal(caught && caught.code, 'ENOTEMPTY')
    assert.equal(calls, 20)
    assert.ok(waited >= 1800, 'the 19 waits of 100 ms took ' + waited + ' ms')
    caught = null
    const once = await withRmSync(['EACCES'], () => removeFolder(kept).catch((err) => { caught = err }))
    assert.equal(caught && caught.code, 'EACCES')
    assert.equal(once, 1)
  } finally {
    fs.rmSync(kept, { recursive: true, force: true })
  }
})

test('TC-R2 close() removes Chrome\'s folder when the first removal fails with ENOTEMPTY', { timeout: 60000 }, async () => {
  const chrome = await launch()
  let folder = null
  const real = fs.rmSync
  let failed = false
  fs.rmSync = function (p, o) {
    if (!failed && String(p).includes('ttt-chrome-')) {
      failed = true
      folder = String(p)
      const err = new Error('ENOTEMPTY: stand-in failure')
      err.code = 'ENOTEMPTY'
      throw err
    }
    return real.call(fs, p, o)
  }
  try {
    await chrome.close()
    assert.equal(failed, true, 'the stand-in failed once')
    assert.equal(fs.existsSync(folder), false, 'the folder is gone')
  } finally {
    fs.rmSync = real
    if (folder) fs.rmSync(folder, { recursive: true, force: true })
  }
})

test('TC-R4 launch() waits for a Chrome that takes 20 seconds to start', { timeout: 90000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-slow-'))
  const script = path.join(dir, 'slow-chrome.sh')
  fs.writeFileSync(script, '#!/bin/sh\nsleep 20\nexec ' + JSON.stringify(findChrome()) + ' "$@"\n', { mode: 0o755 })
  const before = process.env.CHROME_PATH
  process.env.CHROME_PATH = script
  try {
    const started = Date.now()
    const chrome = await launch()
    assert.ok(Date.now() - started >= 19000, 'the stand-in waited before Chrome started')
    await chrome.close()
  } finally {
    if (before === undefined) delete process.env.CHROME_PATH
    else process.env.CHROME_PATH = before
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

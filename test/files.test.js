// T-8 and T-11 of TP-TIC-TAC-TOE-001: nothing to install or fetch, Node 24, the full surface.
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8')
const GAME_FILES = ['index.html', 'style.css', 'game.js', 'ui.js']

test('T-8 the page loads only local files and the repository declares no dependency', () => {
  const html = read('index.html')
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
  assert.deepStrictEqual(scripts.map((a) => (a.match(/src="([^"]+)"/) || [])[1]), ['game.js', 'ui.js'])
  for (const attrs of scripts) assert.doesNotMatch(attrs, /type\s*=\s*"module"/)
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1])
  assert.deepStrictEqual(refs.sort(), ['game.js', 'style.css', 'ui.js'])
  for (const name of GAME_FILES) {
    const text = read(name)
    assert.doesNotMatch(text, /https?:/i, name + ' names an address')
    assert.doesNotMatch(text, /\b(?:src|href)\s*=\s*["']\/\//i, name + ' names a //-address')
    assert.doesNotMatch(text, /url\(\s*["']?\/\//i, name + ' names a //-address')
  }
  if (fs.existsSync(path.join(root, 'package.json'))) {
    const pkg = JSON.parse(read('package.json'))
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.equal(Object.keys(pkg[key] || {}).length, 0, 'package.json declares ' + key)
    }
  }
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false)
})

test('T-11 the run is on Node 24 and the rules offer exactly their seven names', () => {
  assert.match(process.versions.node, /^24\./, 'node ' + process.versions.node)
  const names = Object.keys(require('../game.js')).sort()
  assert.deepStrictEqual(names, ['LINES', 'addResult', 'bestMove', 'newGame', 'newScore', 'play', 'winner'])
})

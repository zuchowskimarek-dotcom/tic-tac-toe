// Starts headless Chrome and drives one page over the Chrome DevTools Protocol, with no package:
// Node 24's built-in WebSocket client. Records every request and WebSocket URL and every error the page raises.
'use strict'
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REPLY_MS = 10000
const START_MS = 15000
const REMOVE_TRIES = 20
const REMOVE_WAIT_MS = 100
const RETRY_CODES = ['ENOTEMPTY', 'EBUSY', 'EPERM']

// Removes a folder and everything in it. Where a process still writes into it, the removal fails
// with ENOTEMPTY, EBUSY or EPERM, and it tries again 100 ms later, 20 tries in all; any other error,
// and the last of those, is thrown. Reads fs.rmSync at each try, so a test may stand in for it.
async function removeFolder (dir) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (err) {
      if (!RETRY_CODES.includes(err.code) || attempt >= REMOVE_TRIES) throw err
      await new Promise((resolve) => setTimeout(resolve, REMOVE_WAIT_MS))
    }
  }
}

// Returns the path of a Chrome binary: CHROME_PATH, then google-chrome, chromium and
// chromium-browser on the PATH, then the macOS application; throws where none is found.
function findChrome () {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const dirs = (process.env.PATH || '').split(path.delimiter)
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(mac)) return mac
  throw new Error('no Chrome found: set CHROME_PATH, or put google-chrome, chromium or chromium-browser on the PATH')
}

// Resolves with the first truthy value check() returns, polling every 50 ms; rejects after ms,
// or at once with the message stop() returns.
function waitFor (check, ms, what, stop) {
  return new Promise((resolve, reject) => {
    const until = Date.now() + ms
    const tick = () => {
      const failed = stop && stop()
      if (failed) return reject(new Error(failed))
      let value
      try { value = check() } catch (err) { value = undefined }
      if (value) return resolve(value)
      if (Date.now() > until) return reject(new Error('timed out after ' + ms + ' ms waiting for ' + what))
      setTimeout(tick, 50)
    }
    tick()
  })
}

// Starts Chrome and attaches to its page; returns { evaluate, open, reload, requests, errors, close }.
// Where any start step fails, it stops Chrome, removes its folder and rethrows.
async function launch () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-chrome-'))
  const args = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank']
  if (process.env.CI) args.unshift('--no-sandbox')

  let chrome
  try {
    chrome = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw err
  }
  let stderr = ''
  let exited = null
  let ws = null
  chrome.stderr.on('data', (d) => { stderr += d })
  chrome.on('error', (err) => { if (exited === null) exited = 'error ' + err.message })
  chrome.on('exit', (code) => { exited = code === null ? 'signal' : code })
  const gone = () => (exited !== null ? 'Chrome exited (' + exited + ') before the test was done: ' + stderr.slice(-2000) : null)

  // Closes the socket, stops Chrome, waits for its exit, then removes its folder.
  async function close () {
    try { if (ws) ws.close() } catch (err) { /* already closed */ }
    if (exited === null) {
      chrome.kill('SIGTERM')
      const stopped = await waitFor(() => exited !== null, REPLY_MS, 'Chrome to exit').then(() => true, () => false)
      if (!stopped) {
        chrome.kill('SIGKILL')
        await waitFor(() => exited !== null, REPLY_MS, 'Chrome to exit after SIGKILL').catch(() => {})
      }
    }
    chrome.stderr.destroy()
    await removeFolder(dir)
  }

  const requests = []
  const errors = []
  let nextId = 1
  const pending = new Map()
  const listeners = []
  let sessionId = null

  // Sends one command, to the page session once attached; rejects after REPLY_MS.
  function send (method, params, toBrowser) {
    const id = nextId++
    const msg = { id, method, params: params || {} }
    if (sessionId && !toBrowser) msg.sessionId = sessionId
    return new Promise((resolve, reject) => {
      const failed = gone()
      if (failed) return reject(new Error(failed))
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('no reply to ' + method + ' within ' + REPLY_MS + ' ms'))
      }, REPLY_MS)
      pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify(msg))
    })
  }

  // Resolves at the next event of this name, or rejects after REPLY_MS.
  function nextEvent (method) {
    return new Promise((resolve, reject) => {
      const on = (msg) => {
        if (msg.method !== method) return
        clearTimeout(timer)
        listeners.splice(listeners.indexOf(on), 1)
        resolve(msg.params)
      }
      const timer = setTimeout(() => {
        listeners.splice(listeners.indexOf(on), 1)
        reject(new Error('no ' + method + ' within ' + REPLY_MS + ' ms'))
      }, REPLY_MS)
      listeners.push(on)
    })
  }

  // Waits for Chrome's DevTools port, connects, and attaches to the page with every domain on.
  async function attach () {
    const portFile = path.join(dir, 'DevToolsActivePort')
    const [port, wsPath] = await waitFor(() => {
      const lines = fs.readFileSync(portFile, 'utf8').split('\n').map((l) => l.trim())
      return lines.length >= 2 && /^\d+$/.test(lines[0]) && lines[1].startsWith('/') ? lines : null
    }, START_MS, 'the file DevToolsActivePort', gone)

    ws = new WebSocket('ws://127.0.0.1:' + port + wsPath)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the DevTools WebSocket did not open within ' + REPLY_MS + ' ms')), REPLY_MS)
      ws.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('the DevTools WebSocket did not open')) }, { once: true })
    })
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id)
        pending.delete(msg.id)
        clearTimeout(timer)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
        return
      }
      if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url)
      if (msg.method === 'Network.webSocketCreated') requests.push(msg.params.url)
      if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + msg.params.exceptionDetails.text)
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error')
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('log: ' + msg.params.entry.text)
      for (const l of listeners.slice()) l(msg)
    })

    let page = null
    const until = Date.now() + START_MS
    while (!page) {
      const { targetInfos } = await send('Target.getTargets', {}, true)
      page = targetInfos.find((t) => t.type === 'page')
      if (!page && Date.now() > until) throw new Error('Chrome opened no page target within ' + START_MS + ' ms')
      if (!page) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, true)).sessionId
    for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await send(domain + '.enable')
  }

  try {
    await attach()
  } catch (err) {
    await close()
    throw err
  }

  // Runs an expression in the page and returns its value.
  async function evaluate (expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error('evaluate failed: ' + r.exceptionDetails.text + ' in ' + expression)
    return r.result.value
  }

  // Opens a file URL and waits for its load event.
  async function open (url) {
    const loaded = nextEvent('Page.loadEventFired')
    await send('Page.navigate', { url })
    await loaded
  }

  // Reloads the page past the cache and waits for its load event.
  async function reload () {
    const loaded = nextEvent('Page.loadEventFired')
    await send('Page.reload', { ignoreCache: true })
    await loaded
  }

  return { evaluate, open, reload, requests, errors, close }
}

module.exports = { launch, findChrome, removeFolder }

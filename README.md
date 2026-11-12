# Tic-Tac-Toe

A small browser game of Tic-Tac-Toe in plain HTML, CSS and JavaScript, built under Mission Control v1.7 as Mission Tic-Tac-Toe.

The game, its tests and its CI land on `main` through one pull request per Implementation Plan.

## Play

Open `index.html` in a browser, straight from disk. Nothing needs installing.

- **Two players:** X and O take turns on one device.
- **Versus computer:** you play X and move first; the computer plays O and never loses.
- **New game** clears the board and keeps the score. The score lasts while the page stays open; switching the mode or reloading the page starts it again at 0.

## Test

The tests need Node 24 and, for the page test, Google Chrome or Chromium.

```
node --test
```

- `test/game.test.js` tests the rules, the computer player and the score.
- `test/files.test.js` checks that the page loads only its own files and that the run is on Node 24.
- `test/page.test.js` plays the real page in headless Chrome through `tools/chrome.js`. Set `CHROME_PATH` where Chrome is not found by itself.

GitHub Actions runs the same command on every push and pull request; the check `test` must pass before a pull request merges.

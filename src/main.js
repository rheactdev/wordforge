/**
 * WordForge · main.js
 *
 * API efficiency strategy
 * ───────────────────────
 * Consonants: 21 letters  (b c d f g h j k l m n p q r s t v w x y z)
 * Vowels:      5 letters  (a e i o u)
 * 21 × 5 = 105  ← magic number
 *
 * We request exactly `wordLength * wordCount` integers from 0–104 in ONE API call.
 * For each position:
 *   C position → consonants[value % 21]   (21 divides 105 → no modulo bias)
 *   V position → vowels[value % 5]        ( 5 divides 105 → no modulo bias)
 *
 * Result: perfectly uniform distribution with one random.org request per batch.
 */

import PIN_ICON from './icons/icons8-pin.svg'

const CONSONANTS = ['b','c','d','f','g','h','j','k','l','m','n','p','q','r','s','t','v','w','x','y','z']
const VOWELS     = ['a','e','i','o','u']
const MAGIC_MAX  = CONSONANTS.length * VOWELS.length - 1  // 104
const MIN_LEN    = 2
const MAX_LEN    = 16
const MIN_WORDS  = 1
const MAX_WORDS  = 20
const MAX_HISTORY = 10
const PINNED_WORDS_KEY = 'wordforge:pinned-words'

const API_KEY = import.meta.env.VITE_RANDOM_ORG_API_KEY

// ── DOM refs ────────────────────────────────────────────────────
const lengthInput    = document.getElementById('length-input')
const decrementBtn   = document.getElementById('decrement')
const incrementBtn   = document.getElementById('increment')
const countInput     = document.getElementById('count-input')
const countDecrementBtn = document.getElementById('count-decrement')
const countIncrementBtn = document.getElementById('count-increment')
const patternPreview = document.getElementById('pattern-preview')
const generateBtn    = document.getElementById('generate-btn')
const wordDisplay    = document.getElementById('word-display')
const wordHistory    = document.getElementById('word-history')
const callsMade      = document.getElementById('calls-made')
const toast          = document.getElementById('toast')

// ── State ────────────────────────────────────────────────────────
let wordLength   = 6
let wordCount    = 1
let sessionCalls = 0
let history      = []
let pinnedWords  = loadPinnedWords()
let toastTimer   = null

// ── Helpers ──────────────────────────────────────────────────────

/** Build the CVCV… pattern string for preview */
function buildPattern(len) {
  return Array.from({ length: len }, (_, i) => i % 2 === 0 ? 'C' : 'V').join(' ')
}

/** Map an integer 0–104 to a letter based on its position index */
function toLetter(value, positionIndex) {
  return positionIndex % 2 === 0
    ? CONSONANTS[value % CONSONANTS.length]
    : VOWELS[value % VOWELS.length]
}

/** Update stepper button disabled states */
function updateSteppers() {
  decrementBtn.disabled = wordLength <= MIN_LEN
  incrementBtn.disabled = wordLength >= MAX_LEN
  countDecrementBtn.disabled = wordCount <= MIN_WORDS
  countIncrementBtn.disabled = wordCount >= MAX_WORDS
}

/** Render the current pattern preview */
function renderPattern() {
  patternPreview.textContent = buildPattern(wordLength)
}

/** Show a temporary toast message */
function showToast(msg, isError = false) {
  clearTimeout(toastTimer)
  toast.textContent = msg
  toast.className = `toast${isError ? ' error' : ''} visible`
  toastTimer = setTimeout(() => { toast.className = `toast${isError ? ' error' : ''}` }, 2200)
}

/** Add word to history chips */
function pushHistory(word) {
  if (pinnedWords.includes(word)) {
    renderHistory()
    return
  }

  history = history.filter(w => w !== word)
  history.unshift(word)
  if (history.length > MAX_HISTORY) history.pop()
  renderHistory()
}

function renderHistory() {
  wordHistory.innerHTML = ''

  const pinnedSet = new Set(pinnedWords)
  const words = [
    ...pinnedWords.map(word => ({ word, pinned: true })),
    ...history
      .filter(word => !pinnedSet.has(word))
      .map(word => ({ word, pinned: false })),
  ]

  words.forEach(({ word, pinned }) => {
    const item = document.createElement('div')
    item.className = `history-item${pinned ? ' pinned' : ''}`

    const copyBtn = document.createElement('button')
    copyBtn.className = 'history-chip'
    copyBtn.textContent = word
    copyBtn.title = `Copy "${word}"`
    copyBtn.addEventListener('click', () => copyToClipboard(word))

    const pinBtn = document.createElement('button')
    pinBtn.className = 'pin-btn'
    pinBtn.type = 'button'
    pinBtn.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${word}`)
    pinBtn.title = pinned ? 'Unpin word' : 'Pin word'
    pinBtn.innerHTML = `<img class="pin-icon" src="${PIN_ICON}" alt="" aria-hidden="true" />`
    pinBtn.addEventListener('click', () => togglePinnedWord(word))

    item.append(copyBtn, pinBtn)
    wordHistory.appendChild(item)
  })
}

function loadPinnedWords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_WORDS_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter(word => typeof word === 'string' && word.length > 0)
      : []
  } catch {
    return []
  }
}

function savePinnedWords() {
  try {
    localStorage.setItem(PINNED_WORDS_KEY, JSON.stringify(pinnedWords))
  } catch {
    showToast('Pin save failed', true)
  }
}

function togglePinnedWord(word) {
  if (pinnedWords.includes(word)) {
    pinnedWords = pinnedWords.filter(w => w !== word)
    showToast(`"${word}" unpinned`)
  } else {
    pinnedWords = [word, ...pinnedWords.filter(w => w !== word)]
    showToast(`"${word}" pinned`)
  }

  savePinnedWords()
  renderHistory()
  refreshGeneratedWordPins()
}

/** Copy text and show toast */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    showToast(`"${text}" copied`)
  } catch {
    showToast('Copy failed', true)
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// ── random.org API ────────────────────────────────────────────────

/**
 * Fetch `count` truly-random integers from random.org (0–MAGIC_MAX inclusive).
 * One API call regardless of generated word count.
 */
async function fetchRandomIntegers(count) {
  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new Error('No API key — add VITE_RANDOM_ORG_API_KEY to your .env file')
  }

  const body = {
    jsonrpc: '2.0',
    method:  'generateIntegers',
    params: {
      apiKey:      API_KEY,
      n:           count,
      min:         0,
      max:         MAGIC_MAX,
      replacement: true,          // with replacement → independent draws
    },
    id: Date.now(),
  }

  const res = await fetch('https://api.random.org/json-rpc/4/invoke', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

  const json = await res.json()

  if (json.error) {
    // Surface quota / key errors clearly
    throw new Error(`random.org: ${json.error.message} (code ${json.error.code})`)
  }

  return json.result.random.data  // number[]
}

// ── Word Generation ───────────────────────────────────────────────

function buildWord(integers) {
  return capitalize(integers.map((v, i) => toLetter(v, i)).join(''))
}

function renderWords(words) {
  const listClass = words.length === 1 ? 'word-list single' : 'word-list'

  wordDisplay.innerHTML = `
    <div class="${listClass}">
      ${words.map(word => {
        const pinned = pinnedWords.includes(word)

        return `
        <div class="word-card${pinned ? ' pinned' : ''}" data-word="${word}">
          <button class="word-result" type="button" title="Click to copy">${word}</button>
          <button class="pin-btn generated-pin" type="button" aria-label="${pinned ? 'Unpin' : 'Pin'} ${word}" title="${pinned ? 'Unpin word' : 'Pin word'}">
            <img class="pin-icon" src="${PIN_ICON}" alt="" aria-hidden="true" />
          </button>
        </div>
        `
      }).join('')}
      <div class="copy-hint">click a word to copy</div>
    </div>
  `

  wordDisplay.querySelectorAll('.word-result').forEach(button => {
    button.addEventListener('click', () => copyToClipboard(button.textContent))
  })

  wordDisplay.querySelectorAll('.generated-pin').forEach(button => {
    button.addEventListener('click', () => {
      const word = button.closest('.word-card').dataset.word
      togglePinnedWord(word)
    })
  })
}

function refreshGeneratedWordPins() {
  wordDisplay.querySelectorAll('.word-card').forEach(card => {
    const word = card.dataset.word
    const pinned = pinnedWords.includes(word)
    const pinBtn = card.querySelector('.generated-pin')

    card.classList.toggle('pinned', pinned)
    pinBtn.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${word}`)
    pinBtn.title = pinned ? 'Unpin word' : 'Pin word'
  })
}

async function generateWords() {
  generateBtn.disabled = true
  generateBtn.classList.add('loading')
  wordDisplay.innerHTML = '<span class="placeholder">…</span>'

  try {
    const integers = await fetchRandomIntegers(wordLength * wordCount)  // ONE API call
    sessionCalls++
    callsMade.textContent = sessionCalls

    const words = Array.from({ length: wordCount }, (_, i) => {
      const start = i * wordLength
      return buildWord(integers.slice(start, start + wordLength))
    })

    renderWords(words)
    words.slice().reverse().forEach(pushHistory)
  } catch (err) {
    wordDisplay.innerHTML = '<span class="placeholder">—</span>'
    showToast(err.message, true)
    console.error('[WordForge]', err)
  } finally {
    generateBtn.disabled = false
    generateBtn.classList.remove('loading')
  }
}

// ── Event Listeners ───────────────────────────────────────────────

decrementBtn.addEventListener('click', () => {
  if (wordLength > MIN_LEN) {
    wordLength--
    lengthInput.value = wordLength
    updateSteppers()
    renderPattern()
  }
})

incrementBtn.addEventListener('click', () => {
  if (wordLength < MAX_LEN) {
    wordLength++
    lengthInput.value = wordLength
    updateSteppers()
    renderPattern()
  }
})

lengthInput.addEventListener('change', () => {
  let v = parseInt(lengthInput.value, 10)
  if (isNaN(v)) v = MIN_LEN
  wordLength = clampNumber(v, MIN_LEN, MAX_LEN)
  lengthInput.value = wordLength
  updateSteppers()
  renderPattern()
})

countDecrementBtn.addEventListener('click', () => {
  if (wordCount > MIN_WORDS) {
    wordCount--
    countInput.value = wordCount
    updateSteppers()
  }
})

countIncrementBtn.addEventListener('click', () => {
  if (wordCount < MAX_WORDS) {
    wordCount++
    countInput.value = wordCount
    updateSteppers()
  }
})

countInput.addEventListener('change', () => {
  let v = parseInt(countInput.value, 10)
  if (isNaN(v)) v = MIN_WORDS
  wordCount = clampNumber(v, MIN_WORDS, MAX_WORDS)
  countInput.value = wordCount
  updateSteppers()
})

// Allow Enter key to generate
lengthInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') generateWords()
})

countInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') generateWords()
})

generateBtn.addEventListener('click', generateWords)

// Keyboard shortcut: Space / Enter on body
document.addEventListener('keydown', e => {
  if (e.target === document.body && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    generateWords()
  }
})

// ── Init ──────────────────────────────────────────────────────────
lengthInput.value = wordLength
countInput.value = wordCount
updateSteppers()
renderPattern()
renderHistory()

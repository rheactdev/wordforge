/**
 * WordForge · main.js
 *
 * API efficiency strategy
 * ───────────────────────
 * Consonants: 21 letters  (b c d f g h j k l m n p q r s t v w x y z)
 * Vowels:      5 letters  (a e i o u)
 * 21 × 5 = 105  ← magic number
 *
 * We request exactly `wordLength` integers from 0–104 in ONE API call.
 * For each position:
 *   C position → consonants[value % 21]   (21 divides 105 → no modulo bias)
 *   V position → vowels[value % 5]        ( 5 divides 105 → no modulo bias)
 *
 * Result: perfectly uniform distribution, minimum API token usage.
 */

const CONSONANTS = ['b','c','d','f','g','h','j','k','l','m','n','p','q','r','s','t','v','w','x','y','z']
const VOWELS     = ['a','e','i','o','u']
const MAGIC_MAX  = CONSONANTS.length * VOWELS.length - 1  // 104
const MIN_LEN    = 2
const MAX_LEN    = 16
const MAX_HISTORY = 10

const API_KEY = import.meta.env.VITE_RANDOM_ORG_API_KEY

// ── DOM refs ────────────────────────────────────────────────────
const lengthInput    = document.getElementById('length-input')
const decrementBtn   = document.getElementById('decrement')
const incrementBtn   = document.getElementById('increment')
const patternPreview = document.getElementById('pattern-preview')
const generateBtn    = document.getElementById('generate-btn')
const wordDisplay    = document.getElementById('word-display')
const wordHistory    = document.getElementById('word-history')
const callsMade      = document.getElementById('calls-made')
const toast          = document.getElementById('toast')

// ── State ────────────────────────────────────────────────────────
let wordLength   = 6
let sessionCalls = 0
let history      = []
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
  history.unshift(word)
  if (history.length > MAX_HISTORY) history.pop()
  renderHistory()
}

function renderHistory() {
  wordHistory.innerHTML = ''
  history.forEach(w => {
    const chip = document.createElement('button')
    chip.className = 'history-chip'
    chip.textContent = w
    chip.title = `Copy "${w}"`
    chip.addEventListener('click', () => copyToClipboard(w))
    wordHistory.appendChild(chip)
  })
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

// ── random.org API ────────────────────────────────────────────────

/**
 * Fetch `count` truly-random integers from random.org (0–MAGIC_MAX inclusive).
 * One API call regardless of word length.
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

async function generateWord() {
  generateBtn.disabled = true
  generateBtn.classList.add('loading')
  wordDisplay.innerHTML = '<span class="placeholder">…</span>'

  try {
    const integers = await fetchRandomIntegers(wordLength)  // ONE API call
    sessionCalls++
    callsMade.textContent = sessionCalls

    const word = integers.map((v, i) => toLetter(v, i)).join('')
    const capitalized = word.charAt(0).toUpperCase() + word.slice(1)

    wordDisplay.innerHTML = `
      <div>
        <div class="word-result" title="Click to copy">${capitalized}</div>
        <div class="copy-hint">click to copy</div>
      </div>
    `
    wordDisplay.querySelector('.word-result').addEventListener('click', () => {
      copyToClipboard(capitalized)
    })

    pushHistory(capitalized)
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
  wordLength = Math.min(MAX_LEN, Math.max(MIN_LEN, v))
  lengthInput.value = wordLength
  updateSteppers()
  renderPattern()
})

// Allow Enter key to generate
lengthInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') generateWord()
})

generateBtn.addEventListener('click', generateWord)

// Keyboard shortcut: Space / Enter on body
document.addEventListener('keydown', e => {
  if (e.target === document.body && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    generateWord()
  }
})

// ── Init ──────────────────────────────────────────────────────────
lengthInput.value = wordLength
updateSteppers()
renderPattern()

'use strict'

// ─── Unit tests — no API key required ────────────────────────────────────────

const { splitWindow } = require('../src/window')
const { estimateTokens, countMessagesTokens, calculateSavings } = require('../src/tokens')
const { buildCompressionPrompt, factsToPromptBlock, parseStructuredResponse } = require('../src/formatters/structured')
const { getProvider } = require('../src/providers/index')
const { tokenFreeCompress } = require('../src/tokenFree')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${b}, got ${a}`)
}

function expect(actual) {
  return {
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`)
    },
    toBe(v) {
      if (actual !== v) throw new Error(`Expected ${v}, got ${actual}`)
    },
    not: {
      toBe(v) {
        if (actual === v) throw new Error(`Expected not to be ${v}`)
      }
    },
    toContain(s) {
      if (typeof actual !== 'string' || !actual.includes(s)) {
        throw new Error(`Expected string to contain "${s}"`)
      }
    }
  }
}

// ─── window.js tests ──────────────────────────────────────────────────────────

console.log('\nwindow.js')

test('splits 50 messages into old=40 and tail=10', () => {
  const messages = Array.from({ length: 50 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1}`
  }))
  const { old, tail } = splitWindow(messages, 10)
  assertEqual(old.length, 40, 'old should be 40')
  assertEqual(tail.length, 10, 'tail should be 10')
})

test('returns all as tail when messages <= keepLast', () => {
  const messages = Array.from({ length: 8 }, (_, i) => ({
    role: 'user', content: `msg ${i}`
  }))
  const { old, tail } = splitWindow(messages, 10)
  assertEqual(old.length, 0, 'old should be empty')
  assertEqual(tail.length, 8, 'tail should be all 8')
})

test('throws on non-array input', () => {
  try {
    splitWindow('not an array')
    assert(false, 'should have thrown')
  } catch (err) {
    assert(err.message.includes('array'), 'error should mention array')
  }
})

test('tail contains the most recent messages', () => {
  const messages = Array.from({ length: 15 }, (_, i) => ({
    role: 'user', content: `Message ${i + 1}`
  }))
  const { tail } = splitWindow(messages, 5)
  assertEqual(tail[0].content, 'Message 11')
  assertEqual(tail[4].content, 'Message 15')
})

// ─── tokens.js tests ──────────────────────────────────────────────────────────

console.log('\ntokens.js')

test('estimates tokens for a string', () => {
  const tokens = estimateTokens('Hello world')
  assert(tokens > 0, 'should return positive number')
})

test('returns 0 for empty string', () => {
  assertEqual(estimateTokens(''), 0)
  assertEqual(estimateTokens(null), 0)
})

test('counts tokens across messages array', () => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there, how can I help you today?' }
  ]
  const count = countMessagesTokens(messages)
  assert(count > 0, 'should return positive count')
})

test('calculates savings correctly', () => {
  const oldMessages = Array.from({ length: 40 }, () => ({
    role: 'user', content: 'This is a message with some content in it for testing purposes'
  }))
  const summaryText = 'Project: test. Decisions: use Node.js. Completed: setup.'
  const { originalTokens, summaryTokens, savedTokens } = calculateSavings(oldMessages, summaryText)
  assert(originalTokens > summaryTokens, 'original should be larger than summary')
  assert(savedTokens > 0, 'should have positive savings')
})

// ─── formatters/structured.js tests ──────────────────────────────────────────

console.log('\nformatters/structured.js')

test('builds compression prompt string', () => {
  const prompt = buildCompressionPrompt(['project', 'decisions'])
  assert(typeof prompt === 'string', 'should return string')
  assert(prompt.includes('project'), 'should mention categories')
  assert(prompt.includes('JSON'), 'should mention JSON')
})

test('converts facts to prompt block', () => {
  const facts = {
    project: 'Node.js router',
    decisions: ['use SQLite', 'Express on port 3000'],
    completed: ['db.js', 'router.js'],
    inProgress: ['provider refactor'],
    preferences: ['no inline comments'],
    openQuestions: ['Ollama auth']
  }
  const block = factsToPromptBlock(facts)
  assert(block.includes('CONVERSATION CONTEXT'), 'should have header')
  assert(block.includes('Node.js router'), 'should include project')
  assert(block.includes('use SQLite'), 'should include decisions')
})

test('parses valid JSON response', () => {
  const raw = JSON.stringify({
    project: 'test project',
    decisions: ['decision 1'],
    completed: [],
    inProgress: ['task 1'],
    preferences: [],
    openQuestions: []
  })
  const parsed = parseStructuredResponse(raw, ['project', 'decisions', 'completed', 'inProgress', 'preferences', 'openQuestions'])
  assertEqual(parsed.project, 'test project')
  assertEqual(parsed.decisions[0], 'decision 1')
})

test('handles JSON wrapped in markdown fences', () => {
  const raw = '```json\n{"project": "fenced project", "decisions": []}\n```'
  const parsed = parseStructuredResponse(raw, ['project', 'decisions'])
  assertEqual(parsed.project, 'fenced project')
})

test('returns fallback on invalid JSON', () => {
  const raw = 'this is not json at all'
  const parsed = parseStructuredResponse(raw, ['project', 'decisions'])
  assert(parsed.project !== undefined, 'should have fallback project')
  assert(parsed._raw === raw, 'should preserve raw text')
})

// ─── providers/index.js tests ─────────────────────────────────────────────────

console.log('\nproviders/index.js')

test('loads groq provider', () => {
  const provider = getProvider('groq')
  assert(typeof provider.callProvider === 'function', 'should have callProvider')
})

test('loads openai provider', () => {
  const provider = getProvider('openai')
  assert(typeof provider.callProvider === 'function', 'should have callProvider')
})

test('loads anthropic provider', () => {
  const provider = getProvider('anthropic')
  assert(typeof provider.callProvider === 'function', 'should have callProvider')
})

test('loads deepseek provider', () => {
  const provider = getProvider('deepseek')
  assert(typeof provider.callProvider === 'function', 'should have callProvider')
})

test('loads gemini provider', () => {
  const provider = getProvider('gemini')
  assert(typeof provider.callProvider === 'function', 'should have callProvider')
})

test('throws on unknown provider', () => {
  try {
    getProvider('unknownprovider')
    assert(false, 'should have thrown')
  } catch (err) {
    assert(err.message.includes('Unsupported provider'), 'should mention unsupported')
  }
})

test('is case insensitive', () => {
  const provider = getProvider('GROQ')
  assert(typeof provider.callProvider === 'function', 'should work with uppercase')
})

// ─── tokenFree.js tests ───────────────────────────────────────────────────────

console.log('\ntokenFree.js')

test('token-free extracts minimum 5 facts from 20 messages', () => {
  const messages = [
    {role:'user', content:'I am building a Node.js CLI tool called ai-router'},
    {role:'assistant', content:'What does it do?'},
    {role:'user', content:'Routes AI requests across Groq Gemini and Claude'},
    {role:'assistant', content:'How do you handle failover?'},
    {role:'user', content:'We decided to use automatic failover when rate limit hit'},
    {role:'assistant', content:'What about storage?'},
    {role:'user', content:'We chose SQLite via node:sqlite no compilation needed'},
    {role:'assistant', content:'Where does data live?'},
    {role:'user', content:'All user data lives in ~/.ai-router/ folder'},
    {role:'assistant', content:'What providers?'},
    {role:'user', content:'Eight built-in providers including Groq Gemini Claude'},
    {role:'assistant', content:'How to add providers?'},
    {role:'user', content:'We completed the provider add command no code changes needed'},
    {role:'assistant', content:'Token limits?'},
    {role:'user', content:'Token caps are done user sets ceiling router switches'},
    {role:'assistant', content:'In progress?'},
    {role:'user', content:'Currently integrating MemoryDistil for compression'},
    {role:'assistant', content:'Open issues?'},
    {role:'user', content:'The python-manager graphify fix is still pending'},
    {role:'user', content:'Next step is building the Web Bridge Chrome extension'}
  ]

  const result = tokenFreeCompress(messages)

  const totalFacts = [
    ...result.summary.decisions,
    ...result.summary.completed,
    ...result.summary.inProgress,
    ...result.summary.openQuestions
  ].length

  expect(totalFacts).toBeGreaterThanOrEqual(5)
  expect(result.summary.project).not.toBe('Not identified')
  expect(result.promptBlock).toContain('CONVERSATION CONTEXT')
})

test('token-free returns empty summary on empty input', () => {
  const result = tokenFreeCompress([])
  assertEqual(result.tokensUsed, 0)
  assertEqual(result.summary.decisions.length, 0)
})

test('assistant questions never classified as decisions or completed', () => {
  const msgs = [
    {role:'user',      content:'We decided to use SQLite'},
    {role:'assistant', content:'How does failover work?'},
    {role:'assistant', content:'Does this work correctly?'},
    {role:'user',      content:'Yes failover works automatically'}
  ]
  const result = tokenFreeCompress(msgs)

  const completedHasAssistant = result.summary.completed.some(c =>
    c.toLowerCase().includes('how does failover work') ||
    c.toLowerCase().includes('does this work correctly')
  )
  assert(!completedHasAssistant, 'assistant questions must not appear in completed')

  const decisionsHasAssistant = result.summary.decisions.some(d =>
    d.toLowerCase().includes('how does failover work') ||
    d.toLowerCase().includes('does this work correctly')
  )
  assert(!decisionsHasAssistant, 'assistant questions must not appear in decisions')

  const inOpenQ = result.summary.openQuestions.some(q =>
    q.toLowerCase().includes('how does failover work')
  )
  assert(inOpenQ, 'assistant question "How does failover work" should land in openQuestions')
})

test('paths with internal dots are not split into fragments', () => {
  const msgs = [
    {role:'user', content:'All data lives in ~/.ai-router/ folder'},
    {role:'user', content:'Config at ~/.ai-router/config.json'}
  ]
  const result = tokenFreeCompress(msgs)

  const allFacts = [
    ...result.summary.decisions,
    ...result.summary.completed,
    ...result.summary.inProgress,
    ...result.summary.preferences,
    ...result.summary.openQuestions
  ]

  const brokenFragment = allFacts.find(f => f.endsWith('ai-router/'))
  assert(!brokenFragment, 'no fragment should end with broken path "ai-router/", got: ' + brokenFragment)

  const intactPath = allFacts.some(f => f.includes('~/.ai-router/'))
  assert(intactPath, 'full path "~/.ai-router/" should appear intact in some field')
})

// ─── results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

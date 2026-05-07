'use strict'

// ─── Unit tests — no API key required ────────────────────────────────────────

const { splitWindow } = require('../src/window')
const { estimateTokens, countMessagesTokens, calculateSavings } = require('../src/tokens')
const { buildCompressionPrompt, factsToPromptBlock, parseStructuredResponse } = require('../src/formatters/structured')
const { getProvider } = require('../src/providers/index')

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

// ─── results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

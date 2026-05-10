'use strict'

const { splitWindow } = require('./window')
const { compress } = require('./compress')
const { tokenFreeCompress } = require('./tokenFree')
const { calculateSavings } = require('./tokens')
const { DEFAULT_CATEGORIES } = require('./formatters/structured')
const { SUPPORTED_PROVIDERS } = require('./providers/index')
const { SUPPORTED_STYLES } = require('./formatters/index')

/**
 * Check if a provider is Ollama
 */
function isOllama(provider) {
  return provider?.toLowerCase() === 'ollama'
}

/**
 * Compress a conversation history into structured facts + recent tail
 *
 * Flow:
 * 1. token-free runs immediately — always produces a draft
 * 2. if provider is Ollama → check if running → if not, log error + return token-free
 * 3. if no provider → return token-free result
 * 4. split old messages into chunks per provider limit
 * 5. compress each chunk, merge results, AI polishes token-free draft
 * 6. return final result — identical format to v0.1.0
 *
 * @param {Object} options
 * @param {Array} options.messages - full conversation history [{role, content}]
 * @param {Object} [options.compression] - compression settings
 * @param {string} [options.compression.provider]
 * @param {string} [options.compression.apiKey]
 * @param {string} [options.compression.model]
 * @param {number} [options.keepLast=10]
 * @param {string} [options.style='structured']
 * @param {string[]} [options.categories]
 *
 * @returns {Promise<Object>}
 */
async function distil(options = {}) {
  const {
    messages,
    compression = {},
    keepLast = 10,
    style = 'structured',
    categories = DEFAULT_CATEGORIES
  } = options

  // validation
  if (!messages || !Array.isArray(messages)) {
    throw new Error('messages is required and must be an array of {role, content} objects')
  }

  if (messages.length === 0) {
    throw new Error('messages array is empty')
  }

  if (!SUPPORTED_STYLES.includes(style)) {
    throw new Error('Unsupported style: "' + style + '". Supported: ' + SUPPORTED_STYLES.join(', '))
  }

  const { provider, apiKey, model } = compression

  // if conversation is too short to compress, return as-is
  if (messages.length <= keepLast) {
    return {
      messages,
      summary: null,
      promptBlock: null,
      meta: {
        originalMessageCount: messages.length,
        compressedCount: 0,
        keptRaw: messages.length,
        tokenCount: 0,
        savedTokenCount: 0,
        compressedAt: null,
        mode: 'passthrough',
        note: 'Conversation too short to compress — returned as-is'
      }
    }
  }

  // split into old messages and recent tail
  const { old: oldMessages, tail } = splitWindow(messages, keepLast)

  // STEP 1 — always run token-free first — guaranteed output no matter what
  const tokenFreeResult = tokenFreeCompress(oldMessages)

  // STEP 2 — check provider availability
  // if no provider specified, return token-free result immediately
  if (!provider) {
    const { savedTokens } = calculateSavings(oldMessages, tokenFreeResult.promptBlock)
    return buildResult({
      summary: tokenFreeResult.summary,
      promptBlock: tokenFreeResult.promptBlock,
      tail,
      originalCount: messages.length,
      compressedCount: oldMessages.length,
      tokensUsed: 0,
      savedTokens,
      mode: 'token-free',
      note: 'No provider specified — token-free mode used'
    })
  }

  // STEP 2b — if Ollama, check if it is running before chunking
  if (isOllama(provider)) {
    const { isOllamaRunning } = require('../../src/providers/ollama')
    const running = await isOllamaRunning()
    if (!running) {
      console.error('[memorydistil] Ollama not running — start with: ollama serve — using token-free mode instead')
      const { savedTokens } = calculateSavings(oldMessages, tokenFreeResult.promptBlock)
      return buildResult({
        summary: tokenFreeResult.summary,
        promptBlock: tokenFreeResult.promptBlock,
        tail,
        originalCount: messages.length,
        compressedCount: oldMessages.length,
        tokensUsed: 0,
        savedTokens,
        mode: 'token-free',
        note: 'Ollama not running — token-free mode used'
      })
    }
  }

  // STEP 3 — AI compression with chunking + Option B enhancement
  try {
    const { summary, promptBlock, tokensUsed } = await compress({
      messages: oldMessages,
      provider,
      apiKey,
      model,
      style,
      categories,
      tokenFreeDraft: tokenFreeResult.promptBlock  // Option B — AI polishes the draft
    })

    const { savedTokens } = calculateSavings(oldMessages, promptBlock)

    return buildResult({
      summary,
      promptBlock,
      tail,
      originalCount: messages.length,
      compressedCount: oldMessages.length,
      tokensUsed,
      savedTokens,
      mode: 'ai'
    })

  } catch (err) {
    // if AI compression fails for any reason, fall back to token-free
    console.error('[memorydistil] AI compression failed: ' + err.message + ' — falling back to token-free mode')
    const { savedTokens } = calculateSavings(oldMessages, tokenFreeResult.promptBlock)
    return buildResult({
      summary: tokenFreeResult.summary,
      promptBlock: tokenFreeResult.promptBlock,
      tail,
      originalCount: messages.length,
      compressedCount: oldMessages.length,
      tokensUsed: 0,
      savedTokens,
      mode: 'token-free',
      note: 'AI compression failed — token-free fallback used: ' + err.message
    })
  }
}

/**
 * Assemble the final return object
 */
function buildResult({ summary, promptBlock, tail, originalCount, compressedCount, tokensUsed, savedTokens, mode, note }) {
  const compressedMessages = [
    { role: 'system', content: promptBlock },
    ...tail
  ]

  const meta = {
    originalMessageCount: originalCount,
    compressedCount,
    keptRaw: tail.length,
    tokenCount: tokensUsed,
    savedTokenCount: savedTokens,
    compressedAt: new Date().toISOString(),
    mode   // 'ai', 'token-free', or 'passthrough'
  }

  if (note) meta.note = note

  return {
    messages: compressedMessages,
    summary,
    promptBlock,
    meta
  }
}

module.exports = { distil }

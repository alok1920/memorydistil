'use strict'

const { splitWindow } = require('./window')
const { compress } = require('./compress')
const { calculateSavings, countMessagesTokens } = require('./tokens')
const { DEFAULT_CATEGORIES } = require('./formatters/structured')
const { SUPPORTED_PROVIDERS } = require('./providers/index')
const { SUPPORTED_STYLES } = require('./formatters/index')

/**
 * Compress a conversation history into structured facts + recent tail
 *
 * @param {Object} options
 * @param {Array} options.messages - full conversation history [{role, content}]
 * @param {Object} options.compression - compression settings
 * @param {string} options.compression.provider - AI provider for compression
 * @param {string} options.compression.apiKey - API key
 * @param {string} [options.compression.model] - optional model override
 * @param {number} [options.keepLast=10] - number of recent messages to keep raw
 * @param {string} [options.style='structured'] - output style
 * @param {string[]} [options.categories] - categories for structured output
 *
 * @returns {Promise<{
 *   messages: Array,          // ready to pass to any AI — summary block + raw tail
 *   summary: Object|string,   // the structured facts or paragraph
 *   promptBlock: string,      // pre-formatted string for direct prompt injection
 *   meta: Object              // token counts and stats
 * }>}
 */
async function distil(options = {}) {
  const {
    messages,
    compression = {},
    keepLast = 10,
    style = 'structured',
    categories = DEFAULT_CATEGORIES
  } = options

  // --- validation ---
  if (!messages || !Array.isArray(messages)) {
    throw new Error('messages is required and must be an array of {role, content} objects')
  }

  if (messages.length === 0) {
    throw new Error('messages array is empty')
  }

  const { provider, apiKey, model } = compression

  if (!provider) {
    throw new Error(
      `compression.provider is required. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`
    )
  }

  if (!apiKey) {
    throw new Error('compression.apiKey is required')
  }

  if (!SUPPORTED_STYLES.includes(style)) {
    throw new Error(
      `Unsupported style: "${style}". Supported: ${SUPPORTED_STYLES.join(', ')}`
    )
  }

  // --- if conversation is too short to compress, return as-is ---
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
        note: 'Conversation too short to compress — returned as-is'
      }
    }
  }

  // --- split into old messages and recent tail ---
  const { old: oldMessages, tail } = splitWindow(messages, keepLast)

  // --- compress the old messages ---
  const { summary, promptBlock, tokensUsed } = await compress({
    messages: oldMessages,
    provider,
    apiKey,
    model,
    style,
    categories
  })

  // --- calculate token savings ---
  const { savedTokens } = calculateSavings(oldMessages, promptBlock)

  // --- build the final messages array ---
  // this is what gets passed directly to any AI provider
  const compressedMessages = [
    {
      role: 'system',
      content: promptBlock
    },
    ...tail
  ]

  return {
    messages: compressedMessages,  // drop this directly into any AI call
    summary,                        // structured facts object or paragraph string
    promptBlock,                    // pre-formatted string version
    meta: {
      originalMessageCount: messages.length,
      compressedCount: oldMessages.length,
      keptRaw: tail.length,
      tokenCount: tokensUsed,       // tokens spent on this compression call
      savedTokenCount: savedTokens, // tokens saved vs sending raw history
      compressedAt: new Date().toISOString()
    }
  }
}

module.exports = { distil }

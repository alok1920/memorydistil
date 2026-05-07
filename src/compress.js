'use strict'

const { getProvider } = require('./providers/index')
const { getCompressionPrompt, parseResponse, toPromptBlock } = require('./formatters/index')
const { DEFAULT_CATEGORIES } = require('./formatters/structured')

/**
 * Compress old messages into structured facts using an AI provider
 *
 * @param {Object} options
 * @param {Array} options.messages - messages to compress
 * @param {string} options.provider - which AI provider to use
 * @param {string} options.apiKey - API key for the provider
 * @param {string} [options.model] - optional model override
 * @param {string} [options.style] - 'structured' or 'paragraph'
 * @param {string[]} [options.categories] - categories for structured output
 * @returns {Promise<{ summary: Object|string, promptBlock: string, tokensUsed: number }>}
 */
async function compress({ messages, provider, apiKey, model, style = 'structured', categories = DEFAULT_CATEGORIES }) {
  if (!messages || messages.length === 0) {
    throw new Error('No messages to compress')
  }

  if (!provider) {
    throw new Error('provider is required (e.g. groq, openai, anthropic, deepseek, gemini)')
  }

  if (!apiKey) {
    throw new Error('apiKey is required')
  }

  const providerAdapter = getProvider(provider)
  const systemPrompt = getCompressionPrompt(style, categories)

  const { text, tokensUsed } = await providerAdapter.callProvider({
    systemPrompt,
    messages,
    apiKey,
    model
  })

  const summary = parseResponse(text, style, categories)
  const promptBlock = toPromptBlock(summary, style)

  return { summary, promptBlock, tokensUsed }
}

module.exports = { compress }

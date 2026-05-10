'use strict'

const { getProvider, getChunkSize } = require('../memorydistil/src/providers/index')
const { getCompressionPrompt, parseResponse, toPromptBlock } = require('../memorydistil/src/formatters/index')
const { buildEnhancementPrompt, parseStructuredResponse, DEFAULT_CATEGORIES } = require('../memorydistil/src/formatters/structured')
const { mergeSummaries } = require('./merge')

/**
 * Split an array into chunks of given size
 *
 * @param {Array} arr
 * @param {number} size
 * @returns {Array[]}
 */
function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Compress a single chunk of messages using the AI provider
 *
 * @param {Object} options
 * @param {Array} options.messages
 * @param {string} options.systemPrompt
 * @param {Object} options.providerAdapter
 * @param {string} options.apiKey
 * @param {string} [options.model]
 * @param {string[]} options.categories
 * @param {string} options.style
 * @returns {Promise<{ summary: Object, tokensUsed: number }>}
 */
async function compressChunk({ messages, systemPrompt, providerAdapter, apiKey, model, categories, style }) {
  const { text, tokensUsed } = await providerAdapter.callProvider({
    systemPrompt,
    messages,
    apiKey,
    model
  })

  const summary = parseResponse(text, style, categories)
  return { summary, tokensUsed }
}

/**
 * Compress old messages using chunked AI compression
 * Handles any conversation length by splitting into provider-safe chunks
 *
 * @param {Object} options
 * @param {Array} options.messages - messages to compress
 * @param {string} options.provider
 * @param {string} options.apiKey
 * @param {string} [options.model]
 * @param {string} [options.style]
 * @param {string[]} [options.categories]
 * @param {string} [options.tokenFreeDraft] - optional draft from token-free pass (Option B)
 * @returns {Promise<{ summary: Object|string, promptBlock: string, tokensUsed: number }>}
 */
async function compress({ messages, provider, apiKey, model, style = 'structured', categories = DEFAULT_CATEGORIES, tokenFreeDraft }) {
  if (!messages || messages.length === 0) {
    throw new Error('No messages to compress')
  }

  if (!provider) {
    throw new Error('provider is required')
  }

  if (!apiKey && provider !== 'ollama') {
    throw new Error('apiKey is required')
  }

  const providerAdapter = getProvider(provider)
  const chunkSize = getChunkSize(provider)
  const chunks = chunkArray(messages, chunkSize)

  let totalTokensUsed = 0

  // if we have a token-free draft, use enhancement mode (Option B)
  // AI polishes the draft instead of reading raw messages from scratch
  if (tokenFreeDraft && style === 'structured') {
    const enhancementPrompt = buildEnhancementPrompt()

    // build the enhancement input: draft + all raw messages
    const conversationText = messages
      .map(m => m.role.toUpperCase() + ': ' + m.content)
      .join('\n\n')

    const enhancementMessages = [
      { role: 'user', content: 'DRAFT SUMMARY:\n' + tokenFreeDraft + '\n\nRAW MESSAGES TO INCORPORATE:\n' + conversationText }
    ]

    const { text, tokensUsed } = await providerAdapter.callProvider({
      systemPrompt: enhancementPrompt,
      messages: enhancementMessages,
      apiKey,
      model
    })

    totalTokensUsed += tokensUsed
    const summary = parseStructuredResponse(text, categories)
    const { toPromptBlock: fmt } = require('../memorydistil/src/formatters/index')
    const promptBlock = fmt(summary, style)

    return { summary, promptBlock, tokensUsed: totalTokensUsed }
  }

  // standard chunked compression — no draft available
  const systemPrompt = getCompressionPrompt(style, categories)
  const chunkSummaries = []

  for (const chunk of chunks) {
    const { summary, tokensUsed } = await compressChunk({
      messages: chunk,
      systemPrompt,
      providerAdapter,
      apiKey,
      model,
      categories,
      style
    })
    chunkSummaries.push(summary)
    totalTokensUsed += tokensUsed
  }

  // merge all chunk summaries into one
  const mergedSummary = style === 'structured'
    ? mergeSummaries(chunkSummaries)
    : chunkSummaries[chunkSummaries.length - 1]  // paragraph: last chunk wins

  const promptBlock = toPromptBlock(mergedSummary, style)

  return { summary: mergedSummary, promptBlock, tokensUsed: totalTokensUsed }
}

module.exports = { compress, chunkArray }

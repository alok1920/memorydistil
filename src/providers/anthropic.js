'use strict'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Call Anthropic API to compress messages
 *
 * @param {Object} options
 * @param {string} options.systemPrompt
 * @param {Array} options.messages
 * @param {string} options.apiKey
 * @param {string} [options.model]
 * @returns {Promise<{ text: string, tokensUsed: number }>}
 */
async function callProvider({ systemPrompt, messages, apiKey, model }) {
  const selectedModel = model || DEFAULT_MODEL

  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: selectedModel,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Compress this conversation:\n\n${conversationText}` }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Anthropic API error ${response.status}: ${error?.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || ''
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)

  return { text, tokensUsed }
}

module.exports = { callProvider, DEFAULT_MODEL }

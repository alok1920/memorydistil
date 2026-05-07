'use strict'

const DEFAULT_MODEL = 'gpt-4o-mini'

/**
 * Call OpenAI API to compress messages
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Compress this conversation:\n\n${conversationText}` }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`OpenAI API error ${response.status}: ${error?.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  const tokensUsed = data.usage?.total_tokens || 0

  return { text, tokensUsed }
}

module.exports = { callProvider, DEFAULT_MODEL }

'use strict'

const DEFAULT_MODEL = 'gemini-1.5-flash'

/**
 * Call Google Gemini API to compress messages
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Compress this conversation:\n\n${conversationText}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000
      }
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(error?.error || response.statusText)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0)

  return { text, tokensUsed }
}

module.exports = { callProvider, DEFAULT_MODEL }

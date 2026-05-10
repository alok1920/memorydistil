'use strict'

const DEFAULT_MODEL = 'llama3'
const OLLAMA_BASE_URL = 'http://localhost:11434'

/**
 * Check if Ollama is running on localhost
 *
 * @returns {Promise<boolean>}
 */
async function isOllamaRunning() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)  // 3 second timeout
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Call Ollama local API to compress messages
 * Ollama is always zero tokens — no API cost
 *
 * @param {Object} options
 * @param {string} options.systemPrompt
 * @param {Array} options.messages
 * @param {string} [options.apiKey]  — not used, Ollama needs no key
 * @param {string} [options.model]
 * @returns {Promise<{ text: string, tokensUsed: number }>}
 */
async function callProvider({ systemPrompt, messages, model }) {
  const running = await isOllamaRunning()

  if (!running) {
    throw new Error(
      'Ollama not running — start with: ollama serve — using token-free mode instead'
    )
  }

  const selectedModel = model || DEFAULT_MODEL

  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Compress this conversation:\n\n${conversationText}` }
      ],
      stream: false,
      options: { temperature: 0.1 }
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Ollama error ${response.status}: ${error?.error || response.statusText}`
    )
  }

  const data = await response.json()
  const text = data.message?.content || ''

  // Ollama reports tokens in prompt_eval_count and eval_count
  // but we report 0 because there is no API cost
  return { text, tokensUsed: 0 }
}

module.exports = { callProvider, DEFAULT_MODEL, isOllamaRunning }

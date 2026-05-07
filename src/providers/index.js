'use strict'

const SUPPORTED_PROVIDERS = ['groq', 'openai', 'anthropic', 'deepseek', 'gemini']

const PROVIDER_MAP = {
  groq: () => require('./groq'),
  openai: () => require('./openai'),
  anthropic: () => require('./anthropic'),
  deepseek: () => require('./deepseek'),
  gemini: () => require('./gemini')
}

/**
 * Get the provider adapter for a given provider name
 *
 * @param {string} provider
 * @returns {{ callProvider: Function, DEFAULT_MODEL: string }}
 */
function getProvider(provider) {
  const normalised = provider?.toLowerCase()

  if (!PROVIDER_MAP[normalised]) {
    throw new Error(
      `Unsupported provider: "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    )
  }

  return PROVIDER_MAP[normalised]()
}

module.exports = { getProvider, SUPPORTED_PROVIDERS }

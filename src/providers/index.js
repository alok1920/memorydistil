'use strict'

const SUPPORTED_PROVIDERS = ['groq', 'openai', 'anthropic', 'deepseek', 'gemini', 'ollama']

const PROVIDER_MAP = {
  groq:      () => require('./groq'),
  openai:    () => require('./openai'),
  anthropic: () => require('./anthropic'),
  deepseek:  () => require('./deepseek'),
  gemini:    () => require('./gemini'),
  ollama:    () => require('./ollama')
}

const CHUNK_SIZE_MAP = {
  groq:      15,
  openai:    30,
  anthropic: 30,
  deepseek:  30,
  gemini:    20,
  ollama:    30
}

function getProvider(provider) {
  const normalised = provider?.toLowerCase()
  if (!PROVIDER_MAP[normalised]) {
    throw new Error(
      'Unsupported provider: "' + provider + '". Supported providers: ' + SUPPORTED_PROVIDERS.join(', ')
    )
  }
  return PROVIDER_MAP[normalised]()
}

function getChunkSize(provider) {
  const normalised = provider?.toLowerCase()
  return CHUNK_SIZE_MAP[normalised] || 15
}

module.exports = { getProvider, getChunkSize, SUPPORTED_PROVIDERS }

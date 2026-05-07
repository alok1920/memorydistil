'use strict'

/**
 * Rough token estimator — 1 token ≈ 4 characters
 * Accurate enough for savings calculation without heavy dependencies
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.ceil(text.length / 4)
}

/**
 * Count total tokens across an array of messages
 *
 * @param {Array} messages - array of {role, content}
 * @returns {number}
 */
function countMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((total, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    return total + estimateTokens(content) + estimateTokens(msg.role) + 4 // 4 per message overhead
  }, 0)
}

/**
 * Calculate how many tokens were saved by compression
 *
 * @param {Array} oldMessages - the messages that were compressed
 * @param {string} summaryText - the summary that replaced them
 * @returns {{ originalTokens: number, summaryTokens: number, savedTokens: number }}
 */
function calculateSavings(oldMessages, summaryText) {
  const originalTokens = countMessagesTokens(oldMessages)
  const summaryTokens = estimateTokens(summaryText)
  const savedTokens = Math.max(0, originalTokens - summaryTokens)

  return { originalTokens, summaryTokens, savedTokens }
}

module.exports = { estimateTokens, countMessagesTokens, calculateSavings }

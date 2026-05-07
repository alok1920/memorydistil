'use strict'

/**
 * Builds the system prompt for paragraph-style compression
 *
 * @returns {string}
 */
function buildParagraphPrompt() {
  return `You are a conversation memory compressor. Your job is to read a conversation and write a concise summary paragraph that captures:
- What is being built or discussed
- Key decisions that were made
- What has been completed
- What is currently in progress
- Any important preferences or constraints
- Open questions or unresolved issues

Rules:
- Write 3-5 sentences maximum
- Be specific and factual
- Write in third person ("The user is building...", "They decided...")
- Output ONLY the summary paragraph, nothing else`
}

/**
 * Wraps a paragraph summary in a prompt block format
 *
 * @param {string} paragraph
 * @returns {string}
 */
function paragraphToPromptBlock(paragraph) {
  return `=== CONVERSATION CONTEXT ===\n${paragraph}\n=== END CONTEXT ===`
}

module.exports = { buildParagraphPrompt, paragraphToPromptBlock }

'use strict'

const structured = require('./structured')
const paragraph = require('./paragraph')

const SUPPORTED_STYLES = ['structured', 'paragraph']

/**
 * Get the compression prompt for a given style
 *
 * @param {string} style
 * @param {string[]} categories
 * @returns {string}
 */
function getCompressionPrompt(style, categories) {
  if (style === 'paragraph') {
    return paragraph.buildParagraphPrompt()
  }
  return structured.buildCompressionPrompt(categories)
}

/**
 * Parse the AI response based on style
 *
 * @param {string} rawResponse
 * @param {string} style
 * @param {string[]} categories
 * @returns {Object|string}
 */
function parseResponse(rawResponse, style, categories) {
  if (style === 'paragraph') {
    return rawResponse.trim()
  }
  return structured.parseStructuredResponse(rawResponse, categories)
}

/**
 * Convert parsed response to a prompt block string
 *
 * @param {Object|string} parsed
 * @param {string} style
 * @returns {string}
 */
function toPromptBlock(parsed, style) {
  if (style === 'paragraph') {
    return paragraph.paragraphToPromptBlock(parsed)
  }
  return structured.factsToPromptBlock(parsed)
}

module.exports = {
  SUPPORTED_STYLES,
  getCompressionPrompt,
  parseResponse,
  toPromptBlock
}

'use strict'

const DEFAULT_CATEGORIES = [
  'project',
  'decisions',
  'completed',
  'inProgress',
  'preferences',
  'openQuestions'
]

/**
 * Builds the system prompt that tells the AI how to compress the conversation
 * into structured facts
 *
 * @param {string[]} categories
 * @returns {string}
 */
function buildCompressionPrompt(categories) {
  const categoryList = categories.join(', ')

  return `You are a conversation memory compressor. Your job is to read a conversation and extract the key facts into a structured JSON object.

Extract facts into these categories: ${categoryList}

Rules:
- Be specific and factual, not vague
- Use short bullet points, not paragraphs  
- Capture decisions, preferences, completed work, and open questions
- If a category has nothing relevant, use an empty array []
- Output ONLY valid JSON, nothing else, no markdown, no explanation

Output format:
{
  "project": "one line description of what is being built",
  "decisions": ["decision 1", "decision 2"],
  "completed": ["thing 1", "thing 2"],
  "inProgress": ["thing 1"],
  "preferences": ["preference 1"],
  "openQuestions": ["question 1"]
}`
}

/**
 * Converts structured facts object into a clean prompt block string
 * ready to paste directly into any AI tool
 *
 * @param {Object} facts - structured facts object
 * @returns {string}
 */
function factsToPromptBlock(facts) {
  const lines = ['=== CONVERSATION CONTEXT ===']

  if (facts.project) {
    lines.push(`Project: ${facts.project}`)
  }

  const arrayFields = {
    decisions: 'Decisions made',
    completed: 'Completed',
    inProgress: 'In progress',
    preferences: 'Preferences',
    openQuestions: 'Open questions'
  }

  for (const [key, label] of Object.entries(arrayFields)) {
    if (facts[key] && facts[key].length > 0) {
      lines.push(`${label}: ${facts[key].join(' | ')}`)
    }
  }

  lines.push('=== END CONTEXT ===')
  return lines.join('\n')
}

/**
 * Parse the raw AI response into a structured facts object
 * Handles cases where the AI wraps output in markdown fences
 *
 * @param {string} rawResponse
 * @param {string[]} categories
 * @returns {Object}
 */
function parseStructuredResponse(rawResponse, categories) {
  let cleaned = rawResponse.trim()

  // strip markdown code fences if present
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')

  try {
    const parsed = JSON.parse(cleaned)

    // ensure all requested categories exist
    const result = {}
    for (const cat of categories) {
      result[cat] = parsed[cat] ?? (cat === 'project' ? '' : [])
    }
    return result
  } catch {
    // if parsing fails return a fallback with the raw text
    return {
      project: 'Context from previous conversation',
      decisions: [],
      completed: [],
      inProgress: [],
      preferences: [],
      openQuestions: [],
      _raw: rawResponse
    }
  }
}

module.exports = {
  DEFAULT_CATEGORIES,
  buildCompressionPrompt,
  factsToPromptBlock,
  parseStructuredResponse
}

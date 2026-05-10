'use strict'

const DEFAULT_CATEGORIES = [
  'project',
  'decisions',
  'completed',
  'inProgress',
  'preferences',
  'openQuestions'
]

function buildCompressionPrompt() {
  return `You are a conversation memory compressor. Read the conversation and extract key facts.

Return a JSON object with these fields:

{
  "project": "One sentence describing what is being built or discussed",
  "decisions": ["List what was decided, chosen, or agreed upon"],
  "completed": ["List what was built, finished, fixed, or shipped"],
  "inProgress": ["List what is currently being worked on or planned next"],
  "preferences": ["List any style preferences, constraints, or strong opinions"],
  "openQuestions": ["List any unresolved questions or things not yet decided"]
}

Rules:
- Use plain natural language, not jargon
- Be specific: "use SQLite via node:sqlite" not "use a database"
- If nothing fits a category, use an empty array []
- Output ONLY valid JSON, no markdown, no explanation, no preamble`
}

function buildEnhancementPrompt() {
  return `You are a conversation memory compressor. You will receive a rough draft summary and additional raw messages.

Your job:
1. Improve the draft - fix vague or incomplete items
2. Add anything important from the raw messages the draft missed
3. Remove duplicates

Return this JSON structure:

{
  "project": "One sentence describing what is being built or discussed",
  "decisions": ["what was decided or chosen"],
  "completed": ["what was built or finished"],
  "inProgress": ["what is currently being worked on"],
  "preferences": ["style preferences or constraints"],
  "openQuestions": ["unresolved questions"]
}

Output ONLY valid JSON, no markdown, no explanation.`
}

function factsToPromptBlock(facts) {
  const lines = ['=== CONVERSATION CONTEXT ===']

  if (facts.project) {
    lines.push('Project: ' + facts.project)
  }

  const arrayFields = {
    decisions:     'Decisions made',
    completed:     'Completed',
    inProgress:    'In progress',
    preferences:   'Preferences',
    openQuestions: 'Open questions'
  }

  for (const [key, label] of Object.entries(arrayFields)) {
    if (facts[key] && facts[key].length > 0) {
      lines.push(label + ': ' + facts[key].join(' | '))
    }
  }

  lines.push('=== END CONTEXT ===')
  return lines.join('\n')
}

function parseStructuredResponse(rawResponse, categories) {
  let cleaned = rawResponse.trim()

  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')

  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }

  try {
    const parsed = JSON.parse(cleaned)
    const result = {}
    for (const cat of categories) {
      if (cat === 'project') {
        result[cat] = typeof parsed[cat] === 'string' ? parsed[cat] : ''
      } else {
        result[cat] = Array.isArray(parsed[cat]) ? parsed[cat] : []
      }
    }
    return result
  } catch {
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
  buildEnhancementPrompt,
  factsToPromptBlock,
  parseStructuredResponse
}

'use strict'

const { factsToPromptBlock } = require('../memorydistil/src/formatters/structured')

const DECISION_KEYWORDS = [
  'decided', 'will use', 'the plan', 'completed', 'going to',
  'we should', 'i want', "let's use", 'use ', 'using ', 'switch to',
  'changed to', 'fixed', 'done', 'finished', 'built', 'added',
  'removed', 'updated', 'refactored', 'installed', 'configured'
]

const INPROGRESS_KEYWORDS = [
  'working on', 'in progress', 'next step', 'need to', 'still need',
  'todo', 'to do', 'pending', 'not yet', 'will do', 'planning to',
  'about to', 'currently', 'refactor', 'now let'
]

const QUESTION_KEYWORDS = [
  'how', 'why', 'what', 'should', 'which', 'when', 'where',
  'can we', 'do we', 'is there', 'is it', 'are there', '?'
]

/**
 * Check if a string contains any of the given keywords (case insensitive)
 *
 * @param {string} text
 * @param {string[]} keywords
 * @returns {boolean}
 */
function containsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

/**
 * Extract the project description from the first few messages
 *
 * @param {Array} messages
 * @returns {string}
 */
function extractProject(messages) {
  const firstFew = messages.slice(0, 6)
  for (const msg of firstFew) {
    const content = msg.content || ''
    if (content.length > 20 && content.length < 200) {
      const lower = content.toLowerCase()
      if (lower.includes('build') || lower.includes('create') || lower.includes('want to') ||
          lower.includes('making') || lower.includes('project') || lower.includes('app') ||
          lower.includes('tool') || lower.includes('system')) {
        return content.slice(0, 120).replace(/\n/g, ' ').trim()
      }
    }
  }
  // fallback — use first user message
  const firstUser = messages.find(m => m.role === 'user')
  return firstUser ? firstUser.content.slice(0, 120).replace(/\n/g, ' ').trim() : 'Not identified'
}

/**
 * Zero-token heuristic compression
 * Runs entirely in JavaScript, no API calls
 * Quality is lower than AI compression but always works
 *
 * @param {Array} messages - old messages to compress
 * @returns {{ summary: Object, promptBlock: string, tokensUsed: number }}
 */
function tokenFreeCompress(messages) {
  if (!messages || messages.length === 0) {
    return {
      summary: {
        project: '',
        decisions: [],
        completed: [],
        inProgress: [],
        preferences: [],
        openQuestions: []
      },
      promptBlock: '',
      tokensUsed: 0
    }
  }

  const decisions = new Set()
  const completed = new Set()
  const inProgress = new Set()
  const preferences = new Set()
  const openQuestions = new Set()

  // track last message per role for recency heuristic
  const lastByRole = {}

  for (const msg of messages) {
    const content = (msg.content || '').trim()
    const role = msg.role || 'user'

    if (!content) continue

    lastByRole[role] = content

    const lines = content.split(/[.\n!]+/).map(l => l.trim()).filter(l => l.length > 5)

    for (const line of lines) {
      const isShort = line.length < 80
      const hasDecision = containsAny(line, DECISION_KEYWORDS)
      const hasProgress = containsAny(line, INPROGRESS_KEYWORDS)
      const hasQuestion = containsAny(line, QUESTION_KEYWORDS)

      // extract decisions and completed items
      if (hasDecision && isShort) {
        const lower = line.toLowerCase()
        if (lower.includes('completed') || lower.includes('finished') ||
            lower.includes('done') || lower.includes('built') ||
            lower.includes('fixed') || lower.includes('added')) {
          completed.add(line.slice(0, 100))
        } else {
          decisions.add(line.slice(0, 100))
        }
      }

      // extract in-progress items
      if (hasProgress && isShort && !hasDecision) {
        inProgress.add(line.slice(0, 100))
      }

      // extract open questions — only from user messages
      if (hasQuestion && isShort && msg.role === 'user' && line.includes('?')) {
        openQuestions.add(line.slice(0, 100))
      }

      // extract preferences — short, opinionated statements
      if (isShort && !hasQuestion && !hasDecision && !hasProgress) {
        const lower = line.toLowerCase()
        if (lower.includes('prefer') || lower.includes('always') ||
            lower.includes('never') || lower.includes('no inline') ||
            lower.includes('clean') || lower.includes('simple') ||
            lower.includes('i like') || lower.includes('i hate') ||
            lower.includes('make sure') || lower.includes('important')) {
          preferences.add(line.slice(0, 100))
        }
      }
    }
  }

  // cap each category to avoid bloat
  const cap = (set, limit) => Array.from(set).slice(0, limit)

  const summary = {
    project: extractProject(messages),
    decisions: cap(decisions, 8),
    completed: cap(completed, 8),
    inProgress: cap(inProgress, 5),
    preferences: cap(preferences, 5),
    openQuestions: cap(openQuestions, 5)
  }

  const promptBlock = factsToPromptBlock(summary)

  return { summary, promptBlock, tokensUsed: 0 }
}

module.exports = { tokenFreeCompress }

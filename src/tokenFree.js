'use strict'

const { factsToPromptBlock } = require('./formatters/structured')

const DECISION_KEYWORDS = [
  'decided', 'will use', 'the plan', 'going to',
  'we should', 'i want', "let's use", 'use ', 'using ', 'switch to',
  'changed to', 'refactored', 'installed', 'configured',
  'chose', 'selected', 'picked', 'going with', 'decided on',
  'we will', 'we are using', 'eight', 'three', 'all data', 'never in'
]

const INPROGRESS_KEYWORDS = [
  'working on', 'in progress', 'need to', 'still need',
  'todo', 'to do', 'not yet', 'will do', 'planning to',
  'about to', 'currently', 'refactor', 'now let',
  'integrating', 'next step', 'after this', 'about to start'
]

const COMPLETED_KEYWORDS = [
  'completed', 'finished', 'built', 'fixed', 'added',
  'removed', 'updated', 'done', 'is done', 'are done',
  'shipped', 'published', 'works', 'working',
  'no code changes', 'no compilation'
]

const OPENQUESTION_KEYWORDS = [
  'still pending', 'fix is still', 'pending', 'unresolved',
  'not sure', "haven't decided", 'tbd', 'open question'
]

const QUESTION_KEYWORDS = [
  'how', 'why', 'what', 'should', 'which', 'when', 'where',
  'can we', 'do we', 'is there', 'is it', 'are there', '?'
]

const PREFERENCE_KEYWORDS = [
  'prefer', 'always', 'never', 'no inline',
  'clean', 'simple', 'i like', 'i hate',
  'make sure', 'important'
]

// loosened max line length — some real sentences run past 80 chars
const MAX_LINE_LEN = 160
const MIN_LINE_LEN = 6

function containsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

/**
 * Extract the project description by scanning user messages for build/create/etc.
 * Falls back to the first user message.
 */
function extractProject(messages) {
  const userMsgs = messages.filter(m => (m.role || 'user') === 'user')
  for (const msg of userMsgs.slice(0, 8)) {
    const content = (msg.content || '').trim()
    if (content.length > 15 && content.length < 240) {
      const lower = content.toLowerCase()
      if (lower.includes('build') || lower.includes('create') || lower.includes('want to') ||
          lower.includes('making') || lower.includes('project') || lower.includes('app') ||
          lower.includes('tool') || lower.includes('cli') || lower.includes('system')) {
        return content.slice(0, 140).replace(/\n/g, ' ').trim()
      }
    }
  }
  const firstUser = userMsgs[0]
  return firstUser ? firstUser.content.slice(0, 140).replace(/\n/g, ' ').trim() : 'Not identified'
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

  // Scan EVERY message — both user and assistant — assistant messages contain
  // confirmations and summaries that are valuable signals.
  for (const msg of messages) {
    const content = (msg.content || '').trim()
    if (!content) continue

    const role = msg.role || 'user'

    // Split on sentence boundaries; also accept the full message as one line
    // when there are no terminators (chat messages often skip punctuation).
    const rawLines = content.split(/[.\n!]+/).map(l => l.trim()).filter(l => l.length >= MIN_LINE_LEN)
    const lines = rawLines.length > 0 ? rawLines : [content]

    for (const line of lines) {
      // Loosened length filter — only skip pathologically long monologues.
      if (line.length > MAX_LINE_LEN) continue

      const hasCompleted = containsAny(line, COMPLETED_KEYWORDS)
      const hasDecision = containsAny(line, DECISION_KEYWORDS)
      const hasProgress = containsAny(line, INPROGRESS_KEYWORDS)
      const hasOpenQ = containsAny(line, OPENQUESTION_KEYWORDS)
      const hasQuestionMark = line.includes('?')
      const hasQuestionWord = containsAny(line, QUESTION_KEYWORDS)
      const hasPreference = containsAny(line, PREFERENCE_KEYWORDS)

      const trimmed = line.slice(0, 140)

      // Order matters — most-specific first.
      if (hasOpenQ) {
        openQuestions.add(trimmed)
        continue
      }

      if (hasCompleted) {
        completed.add(trimmed)
        continue
      }

      if (hasDecision) {
        decisions.add(trimmed)
        continue
      }

      if (hasProgress) {
        inProgress.add(trimmed)
        continue
      }

      // Open questions only from user-side messages with a "?" — assistant
      // questions are usually prompts, not unresolved items.
      if (hasQuestionMark && hasQuestionWord && role === 'user') {
        openQuestions.add(trimmed)
        continue
      }

      if (hasPreference) {
        preferences.add(trimmed)
      }
    }
  }

  const cap = (set, limit) => Array.from(set).slice(0, limit)

  let summary = {
    project: extractProject(messages),
    decisions: cap(decisions, 8),
    completed: cap(completed, 8),
    inProgress: cap(inProgress, 6),
    preferences: cap(preferences, 5),
    openQuestions: cap(openQuestions, 6)
  }

  // Minimum extraction guarantee — if heuristics found almost nothing on a
  // long-ish conversation, fall back to the first sentence of every user
  // message. Better to over-include than to ship an empty context block.
  const factCount = summary.decisions.length + summary.completed.length +
    summary.inProgress.length + summary.openQuestions.length

  if (factCount < 3 && messages.length > 10) {
    const userMsgs = messages.filter(m => (m.role || 'user') === 'user')
    const fallback = userMsgs
      .map(m => (m.content || '').split(/[.\n!?]+/)[0].trim())
      .filter(s => s.length >= MIN_LINE_LEN && s.length <= MAX_LINE_LEN)
      .slice(0, 8)
    summary.inProgress = Array.from(new Set([...summary.inProgress, ...fallback])).slice(0, 8)
  }

  const promptBlock = factsToPromptBlock(summary)

  return { summary, promptBlock, tokensUsed: 0 }
}

module.exports = { tokenFreeCompress }

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
  'not sure', "haven't decided", 'tbd', 'open question',
  'still undecided', 'undecided'
]

const QUESTION_UNKNOWNS = [
  'how', 'what', 'why', 'when', 'which', 'where',
  'should', 'can we', 'is it', 'will it', 'could'
]

// Preferences must contain explicit first-person preference language —
// random factual statements with the word "never" or "always" no longer
// qualify (e.g. "user never sees it" is a fact, not a preference).
const PREFERENCE_REQUIRED_PATTERNS = [
  'i prefer', 'i want', 'i like', 'i need',
  'always respond', 'always use', 'please',
  'my style', 'my preference', 'keep it',
  'no inline', 'in english', 'in hindi',
  'respond in', 'tone should', 'style should',
  'format should'
]
// "never use" only counts when preceded by "i" or "please"
const PREFERENCE_NEVER_USE_RE = /\b(?:i|please)\s+never use\b/

// Phrases that, even when paired with a question mark, are pleasantries
// rather than genuine unresolved project questions.
const GREETING_START_PHRASES = [
  'ready ', 'shall we', 'what do you think', 'does that',
  'make sense', 'sound good', 'thoughts?', 'agree?', 'right?',
  'cool?', 'ok?', 'good morning', 'good evening',
  'hey ', 'hey,', 'hi ', 'hi,', 'hello'
]

const TRIVIAL_ONE_WORD = new Set([
  'thoughts', 'agree', 'right', 'cool', 'ok', 'sure', 'yes', 'no', 'maybe'
])

const MAX_LINE_LEN = 160
const MIN_LINE_LEN = 6

function containsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

function isGreetingLike(text) {
  const lower = text.trim().toLowerCase()
  const stripped = lower.replace(/[?.!,]+$/g, '').trim()
  if (TRIVIAL_ONE_WORD.has(stripped)) return true

  const wordCount = lower.split(/\s+/).filter(Boolean).length
  if (wordCount < 6) return true

  return GREETING_START_PHRASES.some(p => lower.startsWith(p))
}

function isRealOpenQuestion(line, role) {
  if (role !== 'user') return false
  if (isGreetingLike(line)) return false
  const lower = line.toLowerCase()
  if (!QUESTION_UNKNOWNS.some(u => lower.includes(u))) return false
  return true
}

function isExplicitUnresolved(line, role) {
  // OPENQUESTION_KEYWORDS path — captures "X is still pending", "unresolved", etc.
  // Doesn't require a question mark or question word, but still must come from
  // the user and clear the basic greeting filter.
  if (role !== 'user') return false
  if (isGreetingLike(line)) return false
  return containsAny(line, OPENQUESTION_KEYWORDS)
}

function hasPreferenceSignal(line) {
  const lower = line.toLowerCase()
  if (PREFERENCE_REQUIRED_PATTERNS.some(p => lower.includes(p))) return true
  if (PREFERENCE_NEVER_USE_RE.test(lower)) return true
  return false
}

// ── Project extraction ─────────────────────────────────────────

// Captures @scope/name (must precede the called/named/building patterns
// because the @ char isn't otherwise a word boundary).
const SCOPED_NPM_RE = /(@[\w-]+\/[\w][\w\-./]*)/

// "called X" / "named X" — explicit naming
const CALLED_RE = /\b(?:called|named)\s+([@\w][\w\-./@]*)/i

// "building X" / "built X" — extracted as a project name
const BUILDING_RE = /\b(?:i am building|i'm building|building a|building|built|created|built a|created a)\s+([@\w][\w\-./@]*)/i

function cleanIdentifier(s) {
  return s.replace(/[.,;:!?)\]}'"]+$/, '').trim()
}

function tryExtractProjectName(messages) {
  const userMsgs = messages.filter(m => (m.role || 'user') === 'user').slice(0, 8)

  // Priority 1: "called X" / "named X"
  for (const msg of userMsgs) {
    const content = (msg.content || '').trim()
    const m = content.match(CALLED_RE)
    if (m && m[1] && m[1].length >= 2) return cleanIdentifier(m[1])
  }

  // Priority 2: "building X" / "built X"
  for (const msg of userMsgs) {
    const content = (msg.content || '').trim()
    const m = content.match(BUILDING_RE)
    if (m && m[1] && m[1].length >= 2) {
      const candidate = cleanIdentifier(m[1])
      // Skip "a"/"an"/"the" — pattern allows them through but they're noise.
      if (!['a', 'an', 'the'].includes(candidate.toLowerCase())) return candidate
    }
  }

  // Priority 3: scoped npm package — anywhere in the first 8 user messages.
  for (const msg of userMsgs) {
    const content = (msg.content || '').trim()
    const m = content.match(SCOPED_NPM_RE)
    if (m && m[1]) return cleanIdentifier(m[1])
  }

  return null
}

function extractProject(messages) {
  const named = tryExtractProjectName(messages)
  if (named) return named

  // Priority 4: fall back to the first sentence of the first user message,
  // truncated to 60 chars, with question marks stripped.
  const firstUser = messages.find(m => (m.role || 'user') === 'user')
  if (!firstUser) return 'Not identified'
  const firstSentence = (firstUser.content || '').split(/[.\n!?]/)[0].trim()
  if (firstSentence.length < 6) return 'Not identified'
  return firstSentence.slice(0, 60).replace(/[?!]/g, '').trim()
}

/**
 * Zero-token heuristic compression.
 * Runs entirely in JavaScript, no API calls. Always works, lower quality
 * than AI compression.
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

  for (const msg of messages) {
    const content = (msg.content || '').trim()
    if (!content) continue

    const role = msg.role || 'user'

    // Path-aware splitter: protect dots inside paths/files/dotfiles/versions
    // (~/.ai-router/config.json, .env, 1.5) before splitting on sentence terminators.
    const protectedContent = content.replace(/\.(?=[a-zA-Z0-9_-])/g, '___DOT___')
    const rawLines = protectedContent
      .split(/[.\n!]+/)
      .map(l => l.replace(/___DOT___/g, '.').trim())
      .filter(l => l.length >= MIN_LINE_LEN)
    const lines = rawLines.length > 0 ? rawLines : [content]

    for (const line of lines) {
      if (line.length > MAX_LINE_LEN) continue

      const hasCompleted = containsAny(line, COMPLETED_KEYWORDS)
      const hasDecision = containsAny(line, DECISION_KEYWORDS)
      const hasProgress = containsAny(line, INPROGRESS_KEYWORDS)
      const hasQuestionMark = line.includes('?')
      const trimmed = line.slice(0, 140)

      // Assistant messages can only contribute to preferences (rare), never
      // to decisions/completed/inProgress/openQuestions. Their questions are
      // conversational prompts, not unresolved project items.
      if (role === 'assistant') {
        if (hasPreferenceSignal(line)) preferences.add(trimmed)
        continue
      }

      // User messages — most-specific first.

      // 1. Explicit-unresolved phrasing ("X is still pending", "unresolved", tbd)
      if (isExplicitUnresolved(line, role)) {
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

      // 2. Genuine question — passes greeting filter + has an unknown word.
      if (hasQuestionMark && isRealOpenQuestion(line, role)) {
        openQuestions.add(trimmed)
        continue
      }

      // 3. Preferences require explicit first-person preference language.
      if (hasPreferenceSignal(line)) {
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

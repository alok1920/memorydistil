'use strict'

/**
 * Tokenise a string into a set of meaningful words
 * Keeps words 3+ characters for better overlap detection
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenise(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3)
  )
}

/**
 * Count shared words between two strings
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function sharedWordCount(a, b) {
  const tokensA = tokenise(a)
  const tokensB = tokenise(b)
  let count = 0
  for (const word of tokensA) {
    if (tokensB.has(word)) count++
  }
  return count
}

/**
 * Deduplicate an array of strings using keyword overlap
 * If two items share 2+ meaningful words, keep the longer one
 *
 * @param {string[]} items
 * @returns {string[]}
 */
function deduplicateByOverlap(items) {
  const result = []

  for (const candidate of items) {
    let isDuplicate = false

    for (let i = 0; i < result.length; i++) {
      const existing = result[i]
      const shared = sharedWordCount(candidate, existing)

      if (shared >= 2) {
        if (candidate.length > existing.length) {
          result[i] = candidate
        }
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      result.push(candidate)
    }
  }

  return result
}

/**
 * Merge multiple chunk summaries into one facts object
 *
 * Rules:
 * - completed, decisions, openQuestions: combine all, deduplicate by keyword overlap
 * - inProgress, preferences, project: last chunk wins
 *
 * @param {Object[]} chunkSummaries
 * @returns {Object}
 */
function mergeSummaries(chunkSummaries) {
  if (!chunkSummaries || chunkSummaries.length === 0) {
    return { project: '', decisions: [], completed: [], inProgress: [], preferences: [], openQuestions: [] }
  }

  if (chunkSummaries.length === 1) {
    return chunkSummaries[0]
  }

  const allDecisions = chunkSummaries.flatMap(s => s.decisions || [])
  const allCompleted = chunkSummaries.flatMap(s => s.completed || [])
  const allOpenQuestions = chunkSummaries.flatMap(s => s.openQuestions || [])

  const lastChunk = chunkSummaries[chunkSummaries.length - 1]

  return {
    project: lastChunk.project || chunkSummaries.find(s => s.project)?.project || '',
    decisions: deduplicateByOverlap(allDecisions),
    completed: deduplicateByOverlap(allCompleted),
    inProgress: lastChunk.inProgress || [],
    preferences: lastChunk.preferences || [],
    openQuestions: deduplicateByOverlap(allOpenQuestions)
  }
}

module.exports = { mergeSummaries, deduplicateByOverlap, sharedWordCount }

'use strict'

/**
 * Splits a conversation into two parts:
 * - tail: last N messages kept raw (recent context)
 * - old: everything before the tail (to be compressed)
 *
 * @param {Array} messages - array of {role, content} objects
 * @param {number} keepLast - how many recent messages to keep raw (default 10)
 * @returns {{ old: Array, tail: Array }}
 */
function splitWindow(messages, keepLast = 10) {
  if (!Array.isArray(messages)) {
    throw new Error('messages must be an array of {role, content} objects')
  }

  if (messages.length <= keepLast) {
    // not enough messages to compress — return everything as tail
    return { old: [], tail: messages }
  }

  const tail = messages.slice(-keepLast)
  const old = messages.slice(0, messages.length - keepLast)

  return { old, tail }
}

module.exports = { splitWindow }

#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { distil } = require('../src/index')

const VERSION = require('../package.json').version

const HELP = `
memorydistil v${VERSION}
Compress AI conversation history into structured facts for prompt re-injection.

USAGE:
  memorydistil compress <file> [options]
  memorydistil compress --stdin [options]

OPTIONS:
  --provider <name>     AI provider for compression (groq, openai, anthropic, deepseek, gemini)
  --key <apikey>        API key for the provider
  --keep <n>            Number of recent messages to keep raw (default: 10)
  --style <style>       Output style: structured or paragraph (default: structured)
  --out <file>          Save output to file instead of printing
  --format <format>     Output format: full, prompt, messages, summary (default: full)
  --stdin               Read messages from stdin instead of a file
  --version             Show version
  --help                Show this help

EXAMPLES:
  memorydistil compress conversation.json --provider groq --key $GROQ_API_KEY
  memorydistil compress conversation.json --provider openai --key $OPENAI_API_KEY --keep 8
  memorydistil compress conversation.json --format prompt
  cat conversation.json | memorydistil compress --stdin --provider groq --key $GROQ_API_KEY
  memorydistil compress conversation.json --out summary.json

ENVIRONMENT VARIABLES:
  GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY
  If --key is not passed, memorydistil will try to read from the matching env variable.

SUPPORTED PROVIDERS:
  groq       Free tier available — recommended for compression
  openai     gpt-4o-mini by default
  anthropic  claude-haiku by default
  deepseek   Very cheap — good alternative to groq
  gemini     Free tier available
`

function parseArgs(argv) {
  const args = argv.slice(2)
  const result = {
    command: null,
    file: null,
    provider: null,
    key: null,
    keep: 10,
    style: 'structured',
    out: null,
    format: 'full',
    stdin: false
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg === 'compress') {
      result.command = 'compress'
    } else if (arg === '--provider' || arg === '-p') {
      result.provider = args[++i]
    } else if (arg === '--key' || arg === '-k') {
      result.key = args[++i]
    } else if (arg === '--keep') {
      result.keep = parseInt(args[++i], 10)
    } else if (arg === '--style') {
      result.style = args[++i]
    } else if (arg === '--out' || arg === '-o') {
      result.out = args[++i]
    } else if (arg === '--format' || arg === '-f') {
      result.format = args[++i]
    } else if (arg === '--stdin') {
      result.stdin = true
    } else if (arg === '--version' || arg === '-v') {
      console.log(VERSION)
      process.exit(0)
    } else if (arg === '--help' || arg === '-h') {
      console.log(HELP)
      process.exit(0)
    } else if (!arg.startsWith('--') && result.command === 'compress' && !result.file) {
      result.file = arg
    }
    i++
  }

  return result
}

function getApiKey(provider, keyArg) {
  if (keyArg) return keyArg

  const envMap = {
    groq: 'GROQ_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY'
  }

  const envVar = envMap[provider?.toLowerCase()]
  if (envVar && process.env[envVar]) {
    return process.env[envVar]
  }

  return null
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

function formatOutput(result, format) {
  switch (format) {
    case 'prompt':
      return result.promptBlock || 'No compression performed'

    case 'messages':
      return JSON.stringify(result.messages, null, 2)

    case 'summary':
      return typeof result.summary === 'string'
        ? result.summary
        : JSON.stringify(result.summary, null, 2)

    case 'full':
    default:
      return JSON.stringify(result, null, 2)
  }
}

async function run() {
  const args = parseArgs(process.argv)

  if (!args.command) {
    console.log(HELP)
    process.exit(0)
  }

  if (args.command === 'compress') {
    let raw

    if (args.stdin) {
      raw = await readStdin()
    } else if (args.file) {
      const filePath = path.resolve(process.cwd(), args.file)
      if (!fs.existsSync(filePath)) {
        console.error(`Error: file not found — ${filePath}`)
        process.exit(1)
      }
      raw = fs.readFileSync(filePath, 'utf8')
    } else {
      console.error('Error: provide a file path or use --stdin')
      console.log(HELP)
      process.exit(1)
    }

    let messages
    try {
      messages = JSON.parse(raw)
      if (!Array.isArray(messages)) {
        throw new Error('JSON must be an array of {role, content} objects')
      }
    } catch (err) {
      console.error(`Error parsing input: ${err.message}`)
      process.exit(1)
    }

    if (!args.provider) {
      console.error('Error: --provider is required (groq, openai, anthropic, deepseek, gemini)')
      process.exit(1)
    }

    const apiKey = getApiKey(args.provider, args.key)
    if (!apiKey) {
      console.error(`Error: --key is required or set ${args.provider.toUpperCase()}_API_KEY environment variable`)
      process.exit(1)
    }

    try {
      console.error(`Compressing ${messages.length} messages with ${args.provider}...`)

      const result = await distil({
        messages,
        compression: { provider: args.provider, apiKey },
        keepLast: args.keep,
        style: args.style
      })

      const output = formatOutput(result, args.format)

      if (args.out) {
        fs.writeFileSync(path.resolve(process.cwd(), args.out), output, 'utf8')
        console.error(`Saved to ${args.out}`)
        console.error(`Compressed ${result.meta.compressedCount} messages → saved ~${result.meta.savedTokenCount} tokens`)
      } else {
        console.log(output)
        if (args.format === 'full') {
          console.error(`\nCompressed ${result.meta.compressedCount} messages → saved ~${result.meta.savedTokenCount} tokens`)
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  }
}

run()

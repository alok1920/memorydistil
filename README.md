# MemoryDistil

Compress AI conversation history into structured facts optimised for prompt re-injection.

Point it at a long conversation. Get back a compressed version that any AI tool can read and fully understand — at a fraction of the token cost.

```bash
npm install memorydistil
```

---

## The problem

You are building an AI chatbot. After 50 messages, every new message carries all 50 old messages as baggage. That is slow, expensive, and eventually hits context limits.

Simple truncation (delete old messages) loses important context permanently.

**MemoryDistil takes the middle path** — keep the last 10 messages raw, compress everything older into structured facts. The AI on the other end knows everything from message 1, but you only paid for a fraction of the tokens.

---

## Quick start

```javascript
const { distil } = require('memorydistil')

const result = await distil({
  messages: conversationHistory,        // array of {role, content}
  compression: {
    provider: 'groq',                   // who does the compression
    apiKey: process.env.GROQ_API_KEY    // your key, your control
  }
})

// pass directly to any AI provider
await openai.chat.completions.create({ messages: result.messages })
await anthropic.messages.create({ messages: result.messages })
await groq.chat.completions.create({ messages: result.messages })
```

---

## How it works

```
50 messages in
       ↓
1. Token-free compression runs immediately (always works, zero tokens)
       ↓
2. AI compression runs in chunks — one API call per 15-30 messages
       ↓
3. Chunk summaries merged with smart deduplication
       ↓
4. AI polishes the token-free draft
       ↓
[ system: structured facts ] + [ last 10 messages raw ]
```

The returned `messages` array drops directly into any AI provider call.

---

## What comes back

```javascript
{
  messages: [
    {
      role: "system",
      content: `
        === CONVERSATION CONTEXT ===
        Project: Node.js AI router CLI tool
        Decisions made: use SQLite via node:sqlite | Express on port 3000
        Completed: db.js | router.js | commands.js
        In progress: provider architecture refactor
        Preferences: no inline comments | clean function names
        Open questions: how to handle Ollama authentication
        === END CONTEXT ===
      `
    },
    { role: "user", content: "..." },        // last 10 messages raw
    { role: "assistant", content: "..." },
    // ...
  ],

  summary: {
    project: "Node.js AI router CLI tool",
    decisions: ["use SQLite via node:sqlite", "Express on port 3000"],
    completed: ["db.js", "router.js", "commands.js"],
    inProgress: ["provider architecture refactor"],
    preferences: ["no inline comments", "clean function names"],
    openQuestions: ["how to handle Ollama authentication"]
  },

  promptBlock: "=== CONVERSATION CONTEXT ===\n...",

  meta: {
    originalMessageCount: 50,
    compressedCount: 40,
    keptRaw: 10,
    tokenCount: 87,           // tokens spent on compression
    savedTokenCount: 1840,    // tokens saved vs raw history
    compressedAt: "2026-05-07T04:47:13.000Z",
    mode: "ai"                // "ai", "token-free", or "passthrough"
  }
}
```

---

## Chunked compression

MemoryDistil automatically handles conversations of any length by splitting old messages into chunks before compressing. Each chunk stays within provider free-tier limits.

| Provider    | Chunk size | Notes                              |
|-------------|------------|------------------------------------|
| groq        | 15 messages | Stays within 6,000 token/min limit |
| openai      | 30 messages |                                    |
| anthropic   | 30 messages |                                    |
| deepseek    | 30 messages |                                    |
| gemini      | 20 messages |                                    |
| ollama      | 30 messages | Local — no limits                  |

Chunking is automatic. You never configure it. A 200-message conversation just works.

---

## Token-free fallback mode

MemoryDistil always produces output — even with no provider, no API key, and no tokens.

The token-free mode runs pure JavaScript heuristics to extract key facts:
- Lines containing keywords like "decided", "will use", "completed", "going to"
- Short messages under 80 characters (likely decisions or direct questions)
- User messages containing question marks

```javascript
// no provider needed — always works
const result = await distil({ messages: conversationHistory })

console.log(result.meta.mode)     // "token-free"
console.log(result.meta.tokenCount) // 0
```

When a provider is given, token-free runs first as a safety net. If the AI call fails for any reason, the token-free result is returned automatically. Your app never crashes.

---

## Ollama — local compression with zero token cost

Use any locally running Ollama model for compression. No API key, no cost, no token limits.

```javascript
const result = await distil({
  messages: conversationHistory,
  compression: {
    provider: 'ollama',
    model: 'llama3'  // any model you have pulled
  }
})
```

Setup:
```bash
# install from ollama.com, then:
ollama pull llama3
ollama serve
```

If Ollama is not running when distil() is called, you get a clear error and automatic fallback to token-free mode:

```
[memorydistil] Ollama not running — start with: ollama serve — using token-free mode instead
```

---

## Supported providers

| Provider    | Key env var            | Default model             | Notes                   |
|-------------|------------------------|---------------------------|-------------------------|
| groq        | GROQ_API_KEY           | llama-3.1-8b-instant      | Free tier — recommended |
| openai      | OPENAI_API_KEY         | gpt-4o-mini               |                         |
| anthropic   | ANTHROPIC_API_KEY      | claude-haiku-4-5-20251001 |                         |
| deepseek    | DEEPSEEK_API_KEY       | deepseek-chat             | Very cheap              |
| gemini      | GEMINI_API_KEY         | gemini-1.5-flash          | Free tier available     |
| ollama      | none                   | llama3                    | Local, zero cost        |

---

## Options

```javascript
await distil({
  messages,                 // required — [{role, content}]
  compression: {
    provider,               // optional — groq | openai | anthropic | deepseek | gemini | ollama
    apiKey,                 // required for all except ollama
    model                   // optional — overrides default model
  },
  keepLast: 10,             // optional — default 10
  style: 'structured',      // optional — structured | paragraph
  categories: [             // optional — default set
    'project', 'decisions', 'completed',
    'inProgress', 'preferences', 'openQuestions'
  ]
})
```

---

## CLI

```bash
# basic compression
memorydistil compress conversation.json --provider groq --key $GROQ_API_KEY

# use environment variable for the key
export GROQ_API_KEY=your_key
memorydistil compress conversation.json --provider groq

# local compression with Ollama (no key needed)
memorydistil compress conversation.json --provider ollama --model llama3

# output just the prompt block — ready to paste into any AI tool
memorydistil compress conversation.json --provider groq --format prompt

# save to file
memorydistil compress conversation.json --provider groq --out summary.json

# pipe from stdin
cat conversation.json | memorydistil compress --stdin --provider groq
```

---

## Token savings

```
Without MemoryDistil:   50 messages = ~2,000 tokens per message
After compression:      1 summary + 10 raw = ~160 tokens per message
Savings per message:    ~1,840 tokens
Compression cost:       ~87 tokens (one time)
Break even:             First message after compression
```

---

## Use cases

### Drop into any chatbot
```javascript
const { messages } = await distil({
  messages: conversationHistory,
  compression: { provider: 'groq', apiKey: process.env.GROQ_API_KEY }
})
const response = await openai.chat.completions.create({ model: 'gpt-4o', messages })
```

### Cross-tool handoff
```bash
memorydistil compress conversation.json --provider groq --format prompt
# copy output and paste into ChatGPT, Gemini, Claude, or any AI tool
```

### Provider switching (ai-router pattern)
```javascript
// switch from Groq to OpenAI — full context preserved
const { messages } = await distil({ messages: history, compression: { provider: 'groq', apiKey } })
await openai.chat.completions.create({ messages })
```

### Zero-token emergency mode
```javascript
// user is out of tokens — still produces something useful
const { messages, promptBlock } = await distil({ messages: history })
// paste promptBlock into any web AI tool to continue the conversation
```

---

## Changelog

### v0.2.0
- **Chunked compression** — auto splits long conversations into provider-safe chunks. Fixes 413 errors on Groq free tier. Works for any conversation length.
- **Ollama provider** — local compression using any Ollama model. Zero token cost, zero API calls. Falls back to token-free if Ollama is not running.
- **Token-free fallback** — pure JavaScript heuristics always produce output. No provider required. AI enhancement polishes the draft when available.
- **Category extraction fix** — compression prompt now uses plain language descriptions. AI extracts facts more accurately from natural conversation.
- Added `meta.mode` field to return value: `"ai"`, `"token-free"`, or `"passthrough"`

### v0.1.0
- Initial release
- distil() core function
- Providers: groq, openai, anthropic, deepseek, gemini
- Structured facts and paragraph output styles
- Full CLI

---

## Roadmap

### v0.3.0
- Incremental compression — update existing summary rather than recompressing from scratch
- Claude and ChatGPT export file parsing (paste raw export, get messages array)
- Conversation graph mode — extract relationships and entities, not just facts

### v0.5.0
- TypeScript definitions
- Evaluate dual licensing

### v1.0.0
- Stable API
- Full documentation site

---

## Install globally for CLI use

```bash
npm install -g memorydistil
memorydistil --help
```

---

## License

MIT — free for personal and open source use.

> Note: Licensing terms may change in future versions.

---

## Related

- [ai-router](https://github.com/alok1920/ai-router) — universal AI memory and credit router that uses MemoryDistil for context compression
- [Graphify](https://github.com/safishamsi/graphify) — the inspiration for this project — compresses codebases the same way MemoryDistil compresses conversations

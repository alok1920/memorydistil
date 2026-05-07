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

## How it works

```
50 messages in
       ↓
[ messages 1–40 ] → compressed into structured facts (costs ~80 tokens once)
[ messages 41–50 ] → kept raw
       ↓
[ system: structured facts ] + [ last 10 messages raw ]  ← pass to any AI
```

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

That is it. Two lines replace your truncation logic.

---

## What comes back

```javascript
{
  messages: [
    // ready to pass to ANY AI provider directly
    {
      role: "system",
      content: `
        === CONVERSATION CONTEXT ===
        Project: Node.js AI router CLI tool
        Decisions made: SQLite via node:sqlite | Express on port 3000
        Completed: db.js | router.js | commands.js
        In progress: provider architecture refactor
        Preferences: no inline comments | clean function names
        Open questions: how to handle Ollama authentication
        === END CONTEXT ===
      `
    },
    { role: "user", content: "..." },        // message 41 — raw
    { role: "assistant", content: "..." },   // message 42 — raw
    // ... up to message 50
  ],

  summary: {
    project: "Node.js AI router CLI tool",
    decisions: ["SQLite via node:sqlite", "Express on port 3000"],
    completed: ["db.js", "router.js", "commands.js"],
    inProgress: ["provider architecture refactor"],
    preferences: ["no inline comments", "clean function names"],
    openQuestions: ["how to handle Ollama authentication"]
  },

  promptBlock: "=== CONVERSATION CONTEXT ===\n...",  // pre-formatted string

  meta: {
    originalMessageCount: 50,
    compressedCount: 40,       // how many messages got compressed
    keptRaw: 10,               // how many kept as-is
    tokenCount: 87,            // tokens spent on this compression call
    savedTokenCount: 1840,     // tokens saved vs sending raw history
    compressedAt: "2026-05-07T04:47:13.000Z"
  }
}
```

---

## Supported providers

Pass any of these as `compression.provider`. You bring your own API key.

| Provider    | Key env var           | Default model         | Notes                        |
|-------------|----------------------|-----------------------|------------------------------|
| `groq`      | `GROQ_API_KEY`       | llama3-8b-8192        | Free tier — recommended      |
| `openai`    | `OPENAI_API_KEY`     | gpt-4o-mini           |                              |
| `anthropic` | `ANTHROPIC_API_KEY`  | claude-haiku          |                              |
| `deepseek`  | `DEEPSEEK_API_KEY`   | deepseek-chat         | Very cheap                   |
| `gemini`    | `GEMINI_API_KEY`     | gemini-1.5-flash      | Free tier available          |

The compressed `result.messages` works with **any** AI provider or tool — not just the ones listed above.

---

## Options

```javascript
await distil({
  messages,                 // required — [{role, content}]
  compression: {
    provider,               // required — groq | openai | anthropic | deepseek | gemini
    apiKey,                 // required — your API key
    model                   // optional — override the default model
  },
  keepLast: 10,             // optional — how many recent messages to keep raw (default: 10)
  style: 'structured',      // optional — structured | paragraph (default: structured)
  categories: [             // optional — which categories to extract (structured style only)
    'project',
    'decisions',
    'completed',
    'inProgress',
    'preferences',
    'openQuestions'
  ]
})
```

---

## CLI

```bash
# compress a conversation file
memorydistil compress conversation.json --provider groq --key $GROQ_API_KEY

# use environment variable for the key
export GROQ_API_KEY=your_key
memorydistil compress conversation.json --provider groq

# save output to file
memorydistil compress conversation.json --provider groq --out summary.json

# output just the prompt block — ready to paste into any AI tool
memorydistil compress conversation.json --provider groq --format prompt

# output just the messages array
memorydistil compress conversation.json --provider groq --format messages

# pipe from stdin
cat conversation.json | memorydistil compress --stdin --provider groq

# keep more recent messages raw
memorydistil compress conversation.json --provider groq --keep 15

# use paragraph style instead of structured facts
memorydistil compress conversation.json --provider groq --style paragraph
```

Input format is a JSON file containing an array of `{role, content}` objects — the standard format used by all major AI providers.

---

## Use cases

### 1 — Drop into any chatbot

```javascript
// before sending to your AI — just add this
const { messages } = await distil({
  messages: conversationHistory,
  compression: { provider: 'groq', apiKey: process.env.GROQ_API_KEY }
})

// messages works with any AI provider
const response = await openai.chat.completions.create({ model: 'gpt-4o', messages })
```

### 2 — Cross-tool handoff

Export a conversation from Claude, compress it, paste into ChatGPT or Gemini:

```bash
memorydistil compress claude-export.json --provider groq --format prompt
# copy the output and paste into any AI tool — it knows your full context immediately
```

### 3 — Provider switching (ai-router pattern)

When switching providers mid-conversation, `result.messages` carries full context to the new provider:

```javascript
const { messages } = await distil({ messages: history, compression: { provider: 'groq', apiKey } })

// switch from Groq to OpenAI — full context preserved
await openai.chat.completions.create({ messages })
```

---

## Token savings

The compression call itself costs ~80–120 tokens. Every subsequent message saves the difference between sending raw history and sending the compressed version.

```
50 messages (raw):     ~2,000 tokens per message
After compression:     ~160 tokens per message
Savings per message:   ~1,840 tokens
Break even:            First message after compression
```

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

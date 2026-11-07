# Fine Print — Chrome extension

MV3 extension. The agent runtime is plain ES modules (no build, unit-tested);
the UI (slide-out chat panel + options page) is React + Tailwind built with Vite
into `dist/` — that folder is what Chrome loads.

```bash
npm test                      # node --test (runtime + agent logic, no build needed)
npm run build                 # vite build (panel/options/background) + content script IIFE
npm run watch                 # both builds in watch mode; reload the tab to pick up changes
```

Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → **`dist/`**.
(Rebuild after pulling; reload the extension there if the manifest changed.)

### Bundled day-only data (git-ignored `public/data/`, run before `npm run build`)

```bash
npm run prepare:public-housing -- <public-housing-homes-city-of-sydney.csv>
npm run prepare:rent-model -- <Microburb-Data-Science-Task4>/submissions/rents_FinePrintPredictions.csv <…>/models/chosen.json
```

The rent model lookup (`{gnaf_id: [with_car, without_car]}`, ~2 MB) feeds `rent_model` in the
brief; when it covers the flat, its rent drives yield and weekly cost. Without it the build
still works and falls back to the nearby-rentals median.

## `src/runtime/` — hivemind-runtime, ported to JS

Port of `hivemind-runtime` v0.3.2 (Python). Same contract and invariants: the
transcript is the only state, the runtime owns the intra-turn loop
(assemble → generate → execute tools → repeat), the host owns everything between
turns, network is declared never ambient, errors are typed and returned.

| Python | JS | Notes |
|---|---|---|
| `contract.py` | `contract.js` | pydantic models → factory functions with defaults |
| `assemble.py` | `assemble.js` | identical semantics (pending placeholder, token-budget window) |
| `loop.py` | `loop.js` | `runTurn` / `resumeTurn`, async; options camelCase |
| `ask.py` | `ask.js` | tool / json mechanisms, validate-and-retry |
| `registry.py` | `registry.js` | + args validated against `input_schema` before execute |
| `stores.py` | `stores.js` | `MemoryTranscript`, `IndexedDbTranscript` (same record format as the JSONL store) |
| `dialects/openai.py`, `providers/*` | `providers/*` | DeepSeek, OpenRouter, Mock; fetch + SSE streaming |
| `tools/declarative.py`, `manifest.py`, `egress.py`, `http.py`, `secrets.py`, `errors.py` | `tools/*` | declarative HTTP tools — how Microburbs endpoints get defined |
| jsonschema | `validate.js` | small subset (type/properties/required/enum/items/min/max…) |

**Browser differences, on purpose**
- Everything is async (fetch, IndexedDB, chrome.storage).
- API keys are passed in (`apiKey`), read by the host from `chrome.storage.local` — never env, never bundled.
- Tool HTTP refuses redirects (`redirect: 'error'`): a browser can't read a manual redirect's Location, so it can't re-check egress per hop the way Python does.
- Typed tool failures set the outcome's `error` flag (Python's bundle bridge returned them as non-error content).
- `fingerprint()` is async (WebCrypto) and not byte-compatible with Python's.

**Not ported**: Python code-tool sandbox + filesystem bundle loader (not applicable in a browser), `ask`-kind manifest tools (call `ask()` from a tool instead), audit sinks, the Anthropic adapter (experimental upstream).

**Rule**: run the agent loop in the panel page, not the service worker — Chrome kills idle workers.

### Defining a Microburbs tool

```js
declarativeTool({
  name: 'get_estimated_value',
  description: 'Estimated value (AVM) for a property',
  allowed_hosts: ['api-ht.microburbs.com.au'],
  secrets: ['microburbs'],
  input_schema: { type: 'object', properties: { gnaf_id: { type: 'string' } }, required: ['gnaf_id'] },
  request: {
    url: 'https://api-ht.microburbs.com.au/v1/properties/{{args.gnaf_id}}/valuation/avm',
    headers: { Authorization: 'Bearer {{secret:microburbs}}' },
    response: { select: 'data', fields: { value: 'predicted_price', confidence: 'confidence_score' } },
  },
}, { secretProvider: new ChromeStorageSecretProvider() });
```

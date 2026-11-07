// Host wiring: settings -> snapshot + adapter + tools + store, then runTurn.
// This is the HOST side of the runtime contract (owns storage, keys, context).

import {
  ToolError,
  adapterFor,
  ask as askOnce,
  agentSnapshot,
  ChromeStorageSecretProvider,
  IndexedDbTranscript,
  message,
  runTurn,
  ToolRegistry,
} from '../runtime/index.js';
import { addressFromPage, formatAddress } from './address.js';
import { fetchListingBrief, inCoverage, listingBriefTool } from './listing-brief.js';
import { loadPublicHousing } from './public-housing.js';
import { loadRentModel } from './rent-model.js';
import { parseWeeklyRent } from './rent-text.js';
import { parsePriceText } from './price-text.js';
import { LessonBook, uiBlockTool } from './ui-blocks.js';
import { microburbsTools } from './microburbs-tools.js';
import { openAppDb, PropertyMemory, propertyMemoryTools } from './property-memory.js';
import { pageContextText } from './page-context.js';

export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash'; // via OpenRouter
export const DEFAULT_SETTINGS = {
  provider: 'openrouter',
  model: DEFAULT_MODEL,
  brief: { budget: 800000, deposit: 160000, minYield: 4.0, holdYears: 10 },
};

export const HOLD_OPTIONS = [3, 5, 10, 15];

/** Any brief → a valid one: blanks, zeros and junk fall back to the defaults (an empty field once saved holdYears: 0). */
export function cleanBrief(brief = {}) {
  const d = DEFAULT_SETTINGS.brief;
  const pos = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  const budget = pos(brief.budget, d.budget);
  const deposit = pos(brief.deposit, d.deposit) < budget ? pos(brief.deposit, d.deposit) : Math.round(budget * 0.2);
  const hold = pos(brief.holdYears, d.holdYears);
  return {
    budget,
    deposit,
    minYield: pos(brief.minYield, d.minYield),
    holdYears: HOLD_OPTIONS.includes(hold) ? hold : HOLD_OPTIONS.reduce((a, b) => (Math.abs(b - hold) < Math.abs(a - hold) ? b : a)),
  };
}

/** True when every brief field holds a real (positive) value the investor set. Pure. */
export function briefIsSet(brief) {
  return ['budget', 'deposit', 'minYield', 'holdYears'].every((k) => Number(brief?.[k]) > 0);
}

/**
 * Does the investor still need onboarding? Reads the RAW stored settings — loadSettings()
 * fills blanks with defaults, which would make an empty brief look complete.
 * @returns {Promise<{ needed: boolean, stored: Object|null }>} stored = the raw brief (or null)
 */
export async function onboardingState() {
  const { settings, secrets = {} } = await chrome.storage.local.get(['settings', 'secrets']);
  const stored = settings?.brief ?? null;
  const provider = settings?.provider ?? DEFAULT_SETTINGS.provider;
  const missingKeys = [...(secrets[provider] ? [] : [provider]), ...(secrets.microburbs ? [] : ['microburbs'])];
  return { needed: !settings?.onboarded || !briefIsSet(stored) || missingKeys.length > 0, stored, missingKeys };
}

/** Save API keys from onboarding (kept in this browser only). An OpenRouter key switches the agent to OpenRouter + the default model. */
export async function saveKeys({ openrouter, microburbs } = {}) {
  const { settings = {}, secrets = {} } = await chrome.storage.local.get(['settings', 'secrets']);
  const next = { ...secrets };
  if (openrouter?.trim()) next.openrouter = openrouter.trim();
  if (microburbs?.trim()) next.microburbs = microburbs.trim();
  const toOpenRouter = Boolean(openrouter?.trim()) && settings.provider !== 'openrouter';
  await chrome.storage.local.set({
    secrets: next,
    settings: { ...settings, ...(toOpenRouter || !settings.provider ? { provider: 'openrouter', model: DEFAULT_MODEL } : {}) },
  });
}

/** Save the investor brief from onboarding (marks onboarding done). */
export async function saveBrief(brief) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, onboarded: true, brief: cleanBrief({ ...(settings.brief ?? {}), ...brief }) } });
}

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const { mbSource, ...rest } = settings ?? {}; // old installs: the test/proxy source is gone, always the live API
  return { ...DEFAULT_SETTINGS, ...rest, model: rest.model || DEFAULT_SETTINGS.model, brief: cleanBrief(settings?.brief) };
}

function systemPrompt(brief) {
  return `You are Fine Print, a sharp, independent buyer's agent for property investors in the City of Sydney.
You ride along while the investor browses listings and tell them what the listing doesn't say.

Investor brief: budget $${brief.budget.toLocaleString('en-AU')}, deposit $${brief.deposit.toLocaleString('en-AU')}, minimum gross yield ${brief.minYield}%, holding ${brief.holdYears} years.

How to work:
- Microburbs is the source of truth for every number. Never invent figures; if data is missing, say so.
- Start with get_listing_brief for the listing's address: one call returns the matched property, prices, rent estimate, yield, weekly cost, supply pipeline, competition, market and hazards, all computed. Quote its numbers; don't recompute them.
- Public housing comes from the City of Sydney list (public_housing in the brief: this home, homes in the same building, within 200 m and 500 m). State the counts plainly and neutrally; never characterise the people who live there.
- Rent: the brief has two rent figures. rent = the median of similar rentals advertised within 1 km (Microburbs). rent_model = the Fine Print rent model's prediction for this flat (City of Sydney flats only; for Aug–Sep 2026; with and without a car space, the difference is the parking premium; typically within ~$45/wk). When rent_model covers the flat it drives yield and weekly cost (returns.rent_source = "model"). Call it "our rent model", give its period once, and never present it as Microburbs data. If rent_model.covered is false, the property is outside the model's coverage — use the comparables.
- Rental listings: if the brief has rent_listing, the page is a property FOR RENT. Compare the asking rent with the model (rent_listing.vs_model_pct) and the comparables; skip purchase price, yield and weekly holding cost.
- Use the individual tools only to dig deeper on a follow-up question. Suburb tools need the exact suburb name.

Memory:
- Every property you analyse with get_listing_brief is saved automatically, with its listing link and main image. You don't need to save anything yourself.
- Use recall_properties to compare this listing with ones the investor looked at before ("cheaper to hold than the Waterloo one you saw yesterday"), to rank what they've seen (by yield, weekly cost or price), or to find a property they mention by street or suburb. Use get_saved_property for the full saved brief of one of them.
- When you mention a saved property, give its address and when it was analysed. Saved figures are from that day; say so if they may be stale.

Cards (show, don't list):
- The investor wants to SEE the numbers. Whenever your answer is about yield, supply, weekly cost, value, how the area compares, what to offer, a hold scenario, the property's profile or hazards, call render_ui_block with that template — don't list the figures in text.
- Supply TIMING is our sharpest insight: the brief's supply.timeline says WHEN new homes land against the investor's hold (estimated from DA lodgement dates — say "most likely around", never a firm date). For supply questions, lead with when, not just how many, and use the supply_timeline card.
- If a card can't be drawn, don't retry it and don't mention it — just give the key numbers in text.
- Shape: 1–2 sentences of interpretation as text + exactly one render_ui_block call, in the same message. You only pass the template — the card fills itself from Microburbs data (pass "property" for a saved property). Never several cards. No card for small talk.
- Answer like a buyer's agent: lead with the verdict in one sentence, then the 2–4 numbers that matter. Short.
- Never mention API endpoints, routes, field names or tool names (no "market/yield-pct", "valuation/avm", "get_listing_brief"). Say where data comes from in plain words ("recent sales nearby", "rentals advertised within 1 km", "Microburbs' valuation").
- Format in Markdown for a narrow (420 px) panel: **bold** the key numbers, short bullet lists, at most a 2-column table; no long headings, no code blocks. Australian English. Say "property" or "apartment", never "flat". General information, not financial advice.`;
}

async function llmKey(provider) {
  const { secrets } = await chrome.storage.local.get('secrets');
  const key = secrets?.[provider];
  if (!key) throw new Error(`No ${provider === 'openrouter' ? 'OpenRouter' : provider} API key — add it in Settings.`);
  return key;
}

/**
 * Run one turn for a thread. Returns the TurnResult.
 * @param {Object} o
 * @param {string} o.threadId
 * @param {string} o.text                 the user's message
 * @param {{url?: string, title?: string}} [o.listing]  current tab, injected as ephemeral context
 * @param {(d: Object) => void} [o.onDelta]
 * @param {(e: Object) => void} [o.onEvent]
 * @param {() => boolean} [o.shouldContinue]
 */
/**
 * The data pipeline — no LLM. Page → address → strict GNAF match → brief (all
 * Microburbs endpoints in parallel) → saved to property memory. The panel calls this
 * the moment it opens so widgets can render before anyone asks anything.
 * @returns {Promise<{ok: true, brief: Object, address: Object} | {ok: false, reason: string, message: string, hint?: string, address?: Object}>}
 */
export async function loadBrief({ listing, onProgress = () => {} }) {
  const address = addressFromPage(listing?.page);
  if (!address) return { ok: false, reason: 'no_address', message: 'Could not read an address from this page.' };
  onProgress({ stage: 'address', ...address, text: formatAddress(address.parts) });
  if (!inCoverage(address.parts?.suburb)) {
    const suburb = String(address.parts.suburb).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { ok: false, reason: 'out_of_range', suburb, message: `${suburb} is outside our data area (City of Sydney only for now).`, address };
  }
  const settings = await loadSettings();
  try {
    // the listing's own price: shown text first, REA's hidden bracket for "Contact Agent"
    const shown = parsePriceText(listing.page?.listing?.price_text);
    const bracket = listing.page?.hidden?.priceBracket;
    const pagePrice = shown ? { ...shown, source: 'listing price' } : bracket ? { low: bracket.min, high: bracket.max, mid: Math.round((bracket.min + bracket.max) / 2), text: `hidden bracket ${bracket.min}–${bracket.max}`, source: "portal's hidden price bracket" } : null;
    // a rental listing: a weekly rent ("$750 per week"), or the portal says "for rent"
    // even when the price is hidden ("Deposit Taken", "Contact Agent")
    const priceText = listing.page?.listing?.price_text ?? null;
    const pageRent = parseWeeklyRent(priceText) ?? (listing.page?.for_rent ? { weekly: null, text: priceText } : null);
    const brief = await fetchListingBrief({
      parts: address.parts,
      pagePrice: pageRent ? null : pagePrice,
      pageRent,
      source: 'api',
      publicHousing: await loadPublicHousing(),
      rentModel: await loadRentModel(),
      secretProvider: new ChromeStorageSecretProvider(),
      investor: settings.brief,
      onProgress,
    });
    brief.listing = { url: listing.url ?? null, image: listing.page?.image ?? null, portal: listing.page?.listing?.portal ?? null, listing_id: listing.page?.listing?.listing_id ?? null, address_source: address.source };
    await new PropertyMemory().save(brief, { url: listing.url, image: listing.page?.image, title: listing.page?.heading }).catch(() => {});
    return { ok: true, brief, address };
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, reason: e.errorCode, message: e.message, hint: e.hint, address };
    return { ok: false, reason: 'error', message: String(e?.message ?? e), address };
  }
}

export async function ask({ threadId, text, listing, brief = null, onDelta, onEvent, shouldContinue }) {
  return turn({ threadId, inbound: message({ role: 'user', text }), listing, brief, onDelta, onEvent, shouldContinue });
}

// "Read this listing": the button sends a real USER message (models need a user
// turn to answer — an all-system turn made DeepSeek emit junk), and the format
// instructions ride as ephemeral context for that turn only.
export const FIRST_READ_TEXT = 'Read this listing.';
export const FIRST_READ_PROMPT = `The investor clicked "Read this listing". Produce the first read now.

If the listing brief is already in your context, write the read straight from it — no tools. If it isn't, call get_listing_brief ONCE with the listing's full address (include the unit number), then write the read. If there's no exact match, say which address you tried and ask the investor to confirm it.

Reply in Markdown, in exactly this shape (keep it tight — it renders in a 420 px panel):

**<the brief's matched address>**

**Verdict:** <one sentence against the investor's brief>

#### Estimates
| | |
|---|---|
| Estimated value | <$ range and confidence, or n/a> |
| Asking | <$> |
| Likely sale | **<$>** — <the agency's quoting record in a few words> |
| Rent | <$/wk (range), n comparables; this property's last advertised rent if there is one> |
| Rent model | <our model's $/wk for its car-space scenario, the parking premium; or "not covered"> |
| Gross yield | <at asking> · <at likely sale> |
| Weekly cost | <$/wk before tax> |

#### Warnings
- <most serious first, one line each, at most 4; bold the key number>

#### Upside
- <one line>

For a rental listing (the brief has rent_listing), use rows Asking rent / Rent model / Comparables / Last advertised instead, and judge the asking rent, not a purchase.

If a figure is missing, write "n/a" and say why in a few words. No other headings, no code blocks.

Then, in the same message, call render_ui_block ONCE with the card that matters most for the verdict (usually cash_flow if it's over budget or costs a lot weekly, supply if new supply is the biggest risk, yield otherwise).`;

/** Agent-first turn for a fresh listing thread. */
export async function firstRead({ threadId, listing, brief = null, onDelta, onEvent, shouldContinue }) {
  return turn({ threadId, inbound: message({ role: 'user', text: FIRST_READ_TEXT }), listing, brief, instructions: FIRST_READ_PROMPT, onDelta, onEvent, shouldContinue });
}

async function turn({ threadId, inbound, listing, brief = null, instructions = null, onDelta, onEvent, shouldContinue }) {
  const settings = await loadSettings();
  const snapshot = agentSnapshot({
    agent_version: 'fine-print-dev',
    name: 'fine-print',
    provider: settings.provider,
    model: settings.model,
    stream: true,
    params: { max_tokens: 2048, temperature: 0.3 },
    system_base: systemPrompt(settings.brief),
  });
  const adapter = adapterFor(snapshot, { apiKey: await llmKey(settings.provider), ...(settings.provider === 'openrouter' ? { appTitle: 'Fine Print' } : {}) });
  const secretProvider = new ChromeStorageSecretProvider();
  const memory = new PropertyMemory();
  const lessons = new LessonBook();
  // The brief for the listing on screen: pre-loaded by the panel, or fetched this turn by
  // get_listing_brief. Cards fill themselves from it — the agent only picks the template.
  const ctx = { brief };
  const remembering = (t) => ({
    ...t,
    execute: async (args) => {
      const out = await t.execute(args);
      try {
        ctx.brief = JSON.parse(out);
      } catch {
        /* not a brief */
      }
      return out;
    },
  });
  const cards = uiBlockTool({ getBrief: () => ctx.brief, investor: settings.brief, memory, lessons });
  const tools = new ToolRegistry(
    [
      remembering(listingBriefTool({ source: 'api', secretProvider, investor: settings.brief, memory, listing, publicHousing: await loadPublicHousing(), rentModel: await loadRentModel() })),
      ...propertyMemoryTools(memory),
      cards,
      ...microburbsTools({ source: 'api', secretProvider }),
    ],
  );
  const store = new IndexedDbTranscript(threadId, { db: openAppDb() });
  // Ephemeral context: the listing page, re-sent every step, never persisted — so the
  // transcript stays clean and the agent always sees the page as it is now.
  const ephemeralContext = listing?.page
    ? [message({ role: 'system', text: pageContextText(listing.page) })]
    : listing?.url
      ? [message({ role: 'system', text: `The investor is viewing this listing: ${listing.title ?? ''} — ${listing.url}` })]
      : [];
  // The pre-loaded brief rides along as ephemeral context too: the model quotes it
  // instead of calling get_listing_brief (saves a full model round trip).
  if (brief) {
    ephemeralContext.push(message({ role: 'system', text: `Listing brief for the property on screen (from Microburbs; computed, authoritative — quote these numbers):\n${JSON.stringify(brief)}` }));
  }
  // Learning: past render_ui_block mistakes ride along so they stop recurring.
  const lessonText = await lessons.text();
  if (lessonText) ephemeralContext.push(message({ role: 'system', text: lessonText }));
  if (brief) {
    ephemeralContext.push(
      message({ role: 'system', text: 'The investor already sees an overview of this listing at the top of the chat: matched address, a price gauge (estimate, asking, budget, likely sale), gross yield, weekly cost, vacancy, and signal rows for supply, agency quoting, value vs asking, rent comps and hazards. Don\'t repeat it; answer the question, and draw a card when it shows more depth (cash flow, offer, supply, value, area, hold).' }),
    );
  }
  // Turn-specific instructions go LAST so they're the freshest thing the model reads.
  if (instructions) ephemeralContext.push(message({ role: 'system', text: instructions }));
  return runTurn(snapshot, store, adapter, tools, {
    inbound,
    ephemeralContext,
    onDelta,
    onEvent,
    shouldContinue,
    maxToolSteps: 12,
  });
}

// ---------------------------------------------------------------- suggested questions
// The chips above the chat box: generated per listing (after the brief loads) and
// after every reply, so they follow the data and the conversation. One small
// structured one-shot call — not part of the chat transcript.

/** The few numbers that make a question specific — small enough to send every time. */
export function briefDigest(b) {
  if (!b) return null;
  return {
    property: b.property?.address,
    beds: b.property?.beds,
    asking: b.price?.asking,
    likely_sale: b.price?.likely_sale,
    estimated_value: b.price?.value?.estimate,
    agency: b.price?.agency?.cohort,
    rent_weekly: b.rent?.weekly,
    yield_at_asking: b.returns?.gross_yield_pct_at_asking,
    within_budget: b.returns?.within_budget,
    weekly_cost: b.weekly_cost?.net_before_tax,
    new_homes_1km: b.supply?.new_dwellings_stated,
    supply_peak: b.supply?.timeline?.peak ? `${b.supply.timeline.peak.dwellings} homes ~${b.supply.timeline.peak.year} (hold year ${b.supply.timeline.peak.hold_year})` : null,
    build_to_rent_1km: b.supply?.build_to_rent_dwellings,
    risks: (b.risks ?? []).map((r) => r.name),
    vacancy_pct: b.market?.unit_vacancy_pct,
  };
}

/**
 * Three short, tappable next questions for this listing + conversation.
 * @param {Object} o  { brief, recent: [{role, text}] (latest last) }
 * @returns {Promise<string[]|null>} null when generation fails (caller keeps its defaults)
 */
export async function suggestQuestions({ brief = null, recent = [] }) {
  const settings = await loadSettings();
  const snapshot = agentSnapshot({
    agent_version: 'fine-print-questions',
    name: 'fine-print-questions',
    provider: settings.provider,
    model: settings.model,
    stream: false,
    params: { max_tokens: 300, temperature: 0.6 },
    system_base: '',
  });
  const adapter = adapterFor(snapshot, { apiKey: await llmKey(settings.provider), ...(settings.provider === 'openrouter' ? { appTitle: 'Fine Print' } : {}) });
  const instruction = `You suggest the 3 next questions a property investor would tap in a chat about the listing on screen.
- Short: at most 7 words each, phrased as the investor would ask ("What should I offer?").
- Specific to THIS listing's numbers and the conversation so far — lean into what's notable (over budget, heavy new supply, agency underquoting, a hazard, weak or strong yield).
- Each must be answerable with Microburbs data: weekly cost, yield, rent, value, offer, new supply, area comparison, hold outcome, hazards, or comparing with properties seen before.
- Don't repeat questions already asked. Australian English; say "property" or "apartment", never "flat".`;
  const input = JSON.stringify({
    investor: settings.brief,
    listing: briefDigest(brief),
    conversation: recent.slice(-6).map((m) => ({ role: m.role, text: String(m.text ?? '').slice(0, 300) })),
  });
  // Plain text, one question per line, parsed in code: works on every model/provider
  // (forced tool_choice / json mode aren't supported everywhere — that silently failed).
  try {
    const r = await askOnce(adapter, `${instruction}\n\nReply with EXACTLY 3 lines, one question per line — no numbering, no bullets, no quotes, nothing else.`, input, { max_tokens: 200, temperature: 0.6 });
    const questions = parseQuestions(r.text);
    if (questions.length < 2) throw new Error(`unusable reply: ${JSON.stringify(String(r.text ?? '').slice(0, 200))}`);
    await chrome.storage.local.remove('debug_questions_error').catch(() => {});
    return questions;
  } catch (e) {
    console.warn('[fine-print] question suggestions failed', e);
    // kept for the Settings → Export debug file
    await chrome.storage.local.set({ debug_questions_error: { at: new Date().toISOString(), model: settings.model, error: String(e?.message ?? e).slice(0, 500) } }).catch(() => {});
    return null;
  }
}

/** Model text → up to 3 clean questions (tolerates numbering, bullets, quotes, a JSON array). */
export function parseQuestions(text) {
  const raw = String(text ?? '').trim();
  let items;
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
    items = Array.isArray(j) ? j : Array.isArray(j?.questions) ? j.questions : null;
  } catch {
    items = null;
  }
  items ??= raw.split('\n');
  return items
    .map((q) => String(q).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'“]|["'”]$/g, '').trim())
    .filter((q) => q.length >= 5 && q.length <= 80)
    .slice(0, 3);
}

/** name → people-facing label for every tool the agent can call (for rendering transcripts). */
export const TOOL_LABELS = new ToolRegistry([
  listingBriefTool({ source: 'api' }),
  ...propertyMemoryTools(null),
  uiBlockTool({ lessons: new LessonBook(null) }),
  ...microburbsTools({ source: 'api' }),
]).labels();

export async function history(threadId) {
  return new IndexedDbTranscript(threadId, { db: openAppDb() }).messages();
}

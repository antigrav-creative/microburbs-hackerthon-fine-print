// Property memory: every property the agent analyses is saved (one record per
// GNAF id) in the extension's own IndexedDB — the same `fine-print` database the
// transcripts live in — with the listing link and main image URL for reference.
// The agent recalls them with two tools: recall_properties (search/compare) and
// get_saved_property (the full saved brief).
//
// Local to this browser profile. Nothing leaves the machine except in an LLM turn.

import { tool, ToolError } from '../runtime/index.js';

const DB_NAME = 'fine-print';
const DB_VERSION = 2; // v1 = transcripts only (runtime default); v2 adds properties
const PROPS = 'properties';

let dbPromise = null;

/** The app's single connection to the shared database (owns the schema). */
export function openAppDb(indexedDB = globalThis.indexedDB) {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('transcript_records')) {
        db.createObjectStore('transcript_records', { keyPath: 'seq', autoIncrement: true }).createIndex('thread', 'thread_id');
      }
      if (!db.objectStoreNames.contains(PROPS)) {
        const os = db.createObjectStore(PROPS, { keyPath: 'gnaf_id' });
        os.createIndex('last_analysed_at', 'last_analysed_at');
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close(); // let a reset (delete) or upgrade elsewhere proceed
        dbPromise = null; // next use reopens a fresh database
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('[fine-print] database upgrade waiting for other tabs to release it');
  });
  return dbPromise;
}

// ---------------------------------------------------------------- backends
export class IndexedDbPropertyBackend {
  constructor(db = openAppDb()) {
    this.db = db;
  }
  async get(id) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = db.transaction(PROPS).objectStore(PROPS).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  async put(record) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROPS, 'readwrite');
      tx.objectStore(PROPS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async all() {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = db.transaction(PROPS).objectStore(PROPS).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }
}

export class MemoryPropertyBackend {
  constructor() {
    this.rows = new Map();
  }
  async get(id) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async put(record) {
    this.rows.set(record.gnaf_id, structuredClone(record));
  }
  async all() {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
}

// ---------------------------------------------------------------- records
/** Brief + where we saw it → the saved record (merging with any earlier record). */
export function toRecord(brief, listing = {}, previous = null, now = new Date().toISOString()) {
  const urls = [...new Set([...(previous?.urls ?? []), listing.url].filter(Boolean))];
  return {
    gnaf_id: brief.property.gnaf_id,
    address: brief.property.address,
    suburb: brief.property.suburb,
    type: brief.property.type,
    beds: brief.property.beds,
    baths: brief.property.baths,
    parking: brief.property.parking,
    url: listing.url ?? previous?.url ?? null,
    urls,
    image: listing.image ?? previous?.image ?? null,
    listing_title: listing.title ?? previous?.listing_title ?? null,
    asking: brief.price?.asking ?? null,
    likely_sale: brief.price?.likely_sale ?? null,
    estimated_value: brief.price?.value?.estimate ?? null,
    rent_weekly: brief.rent?.weekly ?? null,
    model_rent_weekly: brief.rent_model?.covered ? brief.rent_model.weekly : null,
    yield_at_asking: brief.returns?.gross_yield_pct_at_asking ?? null,
    yield_at_likely: brief.returns?.gross_yield_pct_at_likely ?? null,
    weekly_cost: brief.weekly_cost?.net_before_tax ?? null,
    within_budget: brief.returns?.within_budget ?? null,
    meets_min_yield: brief.returns?.meets_min_yield ?? null,
    new_dwellings_1km: brief.supply?.new_dwellings_stated ?? null,
    build_to_rent_1km: brief.supply?.build_to_rent_dwellings ?? null,
    risks: (brief.risks ?? []).map((r) => r.name),
    first_analysed_at: previous?.first_analysed_at ?? now,
    last_analysed_at: now,
    times_analysed: (previous?.times_analysed ?? 0) + 1,
    brief,
  };
}

/** Compact row for listing/comparison — everything but the full brief. */
export function summary(record) {
  const { brief, urls, ...row } = record;
  return row;
}

const SORTS = {
  recent: (a, b) => String(b.last_analysed_at).localeCompare(String(a.last_analysed_at)),
  yield: (a, b) => (b.yield_at_likely ?? b.yield_at_asking ?? -1) - (a.yield_at_likely ?? a.yield_at_asking ?? -1),
  weekly_cost: (a, b) => (a.weekly_cost ?? Infinity) - (b.weekly_cost ?? Infinity),
  price: (a, b) => (a.likely_sale ?? a.asking ?? Infinity) - (b.likely_sale ?? b.asking ?? Infinity),
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Filter + sort saved records. Pure; exported for tests. */
export function search(records, { query, suburb, beds, max_price, min_yield, sort_by = 'recent', limit = 10 } = {}) {
  const words = norm(query).split(' ').filter(Boolean);
  const out = records.filter((r) => {
    const hay = norm(`${r.address} ${r.suburb} ${r.url ?? ''}`);
    if (words.length && !words.every((w) => hay.includes(w))) return false;
    if (suburb && !norm(r.suburb).includes(norm(suburb))) return false;
    if (beds != null && r.beds !== beds) return false;
    const price = r.likely_sale ?? r.asking ?? r.estimated_value;
    if (max_price != null && !(price != null && price <= max_price)) return false;
    const y = r.yield_at_likely ?? r.yield_at_asking;
    if (min_yield != null && !(y != null && y >= min_yield)) return false;
    return true;
  });
  out.sort(SORTS[sort_by] ?? SORTS.recent);
  return out.slice(0, Math.max(1, Math.min(limit, 50)));
}

export class PropertyMemory {
  constructor(backend = new IndexedDbPropertyBackend()) {
    this.backend = backend;
  }

  async save(brief, listing = {}) {
    const previous = await this.backend.get(brief.property.gnaf_id);
    const record = toRecord(brief, listing, previous);
    await this.backend.put(record);
    return record;
  }

  async search(filters) {
    return search(await this.backend.all(), filters).map(summary);
  }

  /** By GNAF id, or the best match for an address / URL fragment. */
  async find(ref) {
    const direct = await this.backend.get(String(ref ?? '').trim().toUpperCase());
    if (direct) return direct;
    const all = await this.backend.all();
    const byUrl = all.find((r) => (r.urls ?? []).some((u) => u === ref));
    return byUrl ?? search(all, { query: ref, limit: 1 })[0] ?? null;
  }
}

// ---------------------------------------------------------------- tools
export function propertyMemoryTools(memory) {
  return [
    tool({
      name: 'recall_properties',
      label: "Looking through properties you've viewed",
      description:
        "Search every property the investor has had analysed before (saved automatically whenever get_listing_brief runs). Returns compact rows: address, suburb, beds, link, image, asking, likely sale, estimated value, rent, our rent model's rent, yields, weekly cost, budget/yield fit, new dwellings within 1 km, risks, when analysed. Use it to compare this listing with earlier ones, answer 'which was the best one I looked at?', or find a property they mention by name or suburb.",
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to match in the address, suburb or link, e.g. "Victoria Park" or "Waterloo"' },
          suburb: { type: 'string' },
          beds: { type: 'integer' },
          max_price: { type: 'number', description: 'Max likely sale (or asking) price in dollars' },
          min_yield: { type: 'number', description: 'Minimum gross yield, percent, e.g. 4' },
          sort_by: { type: 'string', enum: ['recent', 'yield', 'weekly_cost', 'price'] },
          limit: { type: 'integer', description: '1–50, default 10' },
        },
      },
      execute: async (args) => {
        const rows = await memory.search(args ?? {});
        return JSON.stringify({ count: rows.length, properties: rows });
      },
    }),
    tool({
      name: 'get_saved_property',
      label: 'Opening a saved property',
      description:
        'The full saved brief for one previously analysed property (same shape as get_listing_brief), plus its link, image and when it was analysed. Pass a GNAF id from recall_properties, or an address.',
      input_schema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'GNAF id (e.g. GANSW710358627) or address' } },
        required: ['ref'],
      },
      execute: async ({ ref }) => {
        const record = await memory.find(ref);
        if (!record) throw new ToolError(`no saved property matches "${ref}"`, { hint: 'use recall_properties to see what has been saved', error_code: 'not_found' });
        return JSON.stringify(record);
      },
    }),
  ];
}

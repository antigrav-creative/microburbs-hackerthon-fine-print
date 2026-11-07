import { useEffect, useState } from 'react';
import { cleanBrief, loadSettings } from '../../agent/agent.js';

const KEY_FIELDS = ['deepseek', 'openrouter', 'microburbs'];
const BRIEF_FIELDS = ['budget', 'deposit', 'minYield', 'holdYears'];
const LABEL_CLASS = 'my-2 flex flex-col gap-1 text-muted';

const initialForm = { provider: '', model: '', mbSource: '', brief: {}, keys: {} };

/** Every store in the extension's IndexedDB, read generically (whatever version it's at). */
function dumpIndexedDb(name = 'fine-print') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = async () => {
      const db = req.result;
      const out = { name, version: db.version, stores: {} };
      for (const store of db.objectStoreNames) {
        out.stores[store] = await new Promise((res, rej) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      db.close();
      resolve(out);
    };
  });
}

export default function Options() {
  const [form, setForm] = useState(initialForm);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      const { secrets = {} } = await chrome.storage.local.get('secrets');
      setForm({
        provider: s.provider,
        model: s.model,
        mbSource: s.mbSource,
        brief: Object.fromEntries(BRIEF_FIELDS.map((k) => [k, s.brief[k] ?? ''])),
        keys: Object.fromEntries(KEY_FIELDS.map((k) => [k, secrets[k] ?? ''])),
      });
    })();
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setBrief = (key, value) => setForm((f) => ({ ...f, brief: { ...f.brief, [key]: value } }));
  const setKey = (key, value) => setForm((f) => ({ ...f, keys: { ...f.keys, [key]: value } }));

  // Same nudge as before: switch the example model when the provider flips.
  const onProvider = (provider) => {
    setForm((f) => {
      let model = f.model;
      if (provider === 'openrouter' && model === 'deepseek-chat') model = 'deepseek/deepseek-chat';
      if (provider === 'deepseek' && model.includes('/')) model = 'deepseek-chat';
      return { ...f, provider, model };
    });
  };

  const [exported, setExported] = useState('');
  const exportData = async () => {
    setExported('Exporting…');
    try {
      const { secrets, ...storage } = await chrome.storage.local.get(null); // never export API keys
      const data = {
        exported_at: new Date().toISOString(),
        extension_version: chrome.runtime.getManifest().version,
        secrets_present: Object.keys(secrets ?? {}).filter((k) => secrets[k]),
        chrome_storage_local: storage,
        indexeddb: await dumpIndexedDb(),
      };
      const json = JSON.stringify(data, null, 2);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `fine-print-export-${data.exported_at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setExported(`Downloaded (${Math.round(json.length / 1024)} KB)`);
    } catch (e) {
      setExported(`Export failed: ${e.message}`);
    }
  };

  const save = async () => {
    // empty keys are dropped — clearing a field forgets the key
    const secrets = Object.fromEntries(KEY_FIELDS.map((k) => [k, form.keys[k].trim()]).filter(([, v]) => v));
    const { settings: prev = {} } = await chrome.storage.local.get('settings');
    const settings = {
      ...prev, // keeps `onboarded` and anything else the panel stores
      provider: form.provider,
      model: form.model.trim(),
      mbSource: form.mbSource,
      brief: cleanBrief(Object.fromEntries(BRIEF_FIELDS.map((k) => [k, Number(form.brief[k])]))),
    };
    await chrome.storage.local.set({ settings, secrets });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mx-auto my-10 max-w-[560px] px-4">
      <header className="mb-6 flex items-center gap-2.5">
        <span className="inline-grid h-6 w-6 place-items-center rounded-[6px] bg-ink text-[13px] text-paper">F</span>
        <h1 className="font-voice text-[34px] font-normal leading-none tracking-[-0.01em]">Fine Print settings</h1>
      </header>
      <p className="mt-1 mb-6 text-[12.5px] text-muted">Stored in this browser only (chrome.storage.local). Never committed.</p>

      <fieldset className="mb-4 rounded-[10px] border border-line bg-card px-4 py-3">
        <legend className="px-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Model</legend>
        <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
          <label className="text-[12.5px] text-muted">Provider</label>
          <select value={form.provider} onChange={(e) => onProvider(e.target.value)}>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
          </select>
          <label className="text-[12.5px] text-muted">Model</label>
          <input
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="deepseek-chat  ·  or deepseek/deepseek-chat on OpenRouter"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-line pt-3">
          <label className={LABEL_CLASS}>
            DeepSeek API key
            <input type="password" autoComplete="off" value={form.keys.deepseek ?? ''} onChange={(e) => setKey('deepseek', e.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            OpenRouter API key
            <input type="password" autoComplete="off" value={form.keys.openrouter ?? ''} onChange={(e) => setKey('openrouter', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset className="mb-4 rounded-[10px] border border-line bg-card px-4 py-3">
        <legend className="px-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Microburbs data</legend>
        <label className={LABEL_CLASS}>
          Source
          <select value={form.mbSource} onChange={(e) => set('mbSource', e.target.value)}>
            <option value="test">Test data (bundled, no network)</option>
            <option value="proxy">Demo proxy (uses your Chrome session — visit microburbs-api-demos.vercel.app first)</option>
            <option value="api">Hackathon API (team key)</option>
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Team key
          <input type="password" autoComplete="off" value={form.keys.microburbs ?? ''} onChange={(e) => setKey('microburbs', e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="mb-4 rounded-[10px] border border-line bg-card px-4 py-3">
        <legend className="px-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Investor brief</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <label className={LABEL_CLASS}>
            Budget ($)
            <input type="number" value={form.brief.budget ?? ''} onChange={(e) => setBrief('budget', e.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            Deposit ($)
            <input type="number" value={form.brief.deposit ?? ''} onChange={(e) => setBrief('deposit', e.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            Min gross yield (%)
            <input type="number" step="0.1" value={form.brief.minYield ?? ''} onChange={(e) => setBrief('minYield', e.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            Hold (years)
            <input type="number" value={form.brief.holdYears ?? ''} onChange={(e) => setBrief('holdYears', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button onClick={save} className="border-none bg-ink px-4 py-2 font-semibold text-paper hover:opacity-85">
          Save
        </button>
        <span className="font-mono text-[11px] text-muted">{saved ? 'Saved.' : ''}</span>
      </div>

      <fieldset className="mt-6 rounded-[10px] border border-line bg-card px-4 py-3">
        <legend className="px-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Debug</legend>
        <p className="mb-2.5 text-[12.5px] text-muted">Download everything stored locally (transcripts, saved properties, card lessons, settings) as one JSON file. API keys are removed.</p>
        <div className="flex items-center gap-3">
          <button onClick={exportData}>Export data (JSON)</button>
          <span className="font-mono text-[11px] text-muted">{exported}</span>
        </div>
      </fieldset>
    </div>
  );
}

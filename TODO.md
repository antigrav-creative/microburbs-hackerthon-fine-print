# Fine Print — epics (Sat 7 Nov)

Hand-in closes **15:00** (freeze ~14:30). Team key + CSVs arrived **11:00**.
🟢 = no data needed · 🔑 = needs the key or the day's CSVs

## Task 3 — Chrome extension (main submission)

- [x] 🟢 **Listing brief** — one tool: match address → fetch every Microburbs endpoint in parallel → investor maths in code (rent, yield, weekly cost, supply) → cached per property
- [x] 🟢 **Fast first read** — agent talks first using the brief: one tool call, one model step
- [x] 🟢 **Address reading** — clean address off REA and Domain listing pages (unit, number, street, suburb)
- [x] 🔑 **Exact address matching** — City of Sydney address list, geocode fallback, "Matched: …" shown
- [x] 🟢 **Panel UI** — overview gauge, signals, cards; polished with Carlos's redesign (icons, two-row header, spacing) (#21)
- [x] 🟢 **Supply pipeline view** — new dwellings within 1 km, build-to-rent called out, timed against the hold
- [x] 🔑 **Public housing flag** — supplied CSV → this home / same building / within 200 m + 500 m; data stays out of the public repo (#18)
- [x] 🔑 **Switch to the live API** — demo proxy and bundled test data removed (#15)
- [x] 🟢 **Property memory** — every analysed property saved (IndexedDB, link + main image); `recall_properties` + `get_saved_property`
- [x] 🟢 **Shortlist** — spreadsheet: sort, filter, own + formula columns, pinned columns, CSV/copy; toolbar icon opens it (#13)
- [x] 🟢 **Judge-ready onboarding** — OpenRouter + Microburbs keys in setup, DeepSeek V4.1 Flash default, Reset everything in Settings (#15)
- [x] 🟢 **Out of data range** — friendly card for listings outside the City of Sydney (#21)
- [x] 🟢 **Collapsed button + F shortcut** — bottom-right pill, F opens/closes (#12)
- [x] 🟢 **Reusable charts** — `chart('bars'|'columns'|'line'|'meter')` + `<Chart>` (#16)
- [ ] 🟢 **Prefetch from search results** _(stretch — not doing)_

## Submission

- [x] 🟢 **Competitor scan + market research** — `research.md` (backup folder): competitors, market size, Reddit evidence
- [x] 🟢 **Pitch** — 45s team pitch + ~90s demo + business case (`pitch/PITCH.md`); 9-slide deck (Claude artifact, share before sending)
- [ ] 🔑 **Live check before freeze** — reload, F on a real REA listing, ask a question that draws a card (streaming + scroll), Domain + Waterloo example
- [x] 🔑 **Demo recording** — `pitch/demo.mp4` (2 min 14 s) · pitch `pitch/45s.mp4` (39 s)
- [ ] 🟢 **Judge package** — submit `fine-print-extension.zip` PRIVATELY (contains supplied data; never a public release); decide keys: judges' own vs a spend-capped OpenRouter key in the notes
- [ ] 🟢 **report.html** — what buyers see today → our added value → why these facts → data handling (Microburbs = source of truth, supplied CSVs not republished)
- [ ] 🔑 **Report numbers** — address-match accuracy, final screenshots
- [ ] 🟢 **Repo hygiene** — README (install + `npm run prepare:public-housing`), close #20 (superseded by #21)

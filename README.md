<div align="center">

<img src="assets/logo.svg" alt="Fine Print logo" width="96" height="96">

# Fine Print

### Read it before you buy it.

**An intelligent investment analyst on every realestate.com.au and Domain listing, powered by Microburbs data.**

![Microburbs AI Hackathon 2026](https://img.shields.io/badge/Microburbs_AI_Hackathon-2026-2f64d9)
![Task 3: browser extension](https://img.shields.io/badge/Task_3-Browser_extension-1e1d1b)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)
![Works on REA + Domain](https://img.shields.io/badge/Works_on-REA_%2B_Domain-e3a008)

![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind 4](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-rolldown-646CFF?logo=vite&logoColor=white)
![DeepSeek V4.1 Flash](https://img.shields.io/badge/Model-DeepSeek_V4.1_Flash-4D6BFE)
![OpenRouter](https://img.shields.io/badge/via-OpenRouter-6566F1)
![Tests](https://img.shields.io/badge/tests-93_passing-2ea44f)
![Rent model](https://img.shields.io/badge/Rent_model-%2442%2Fwk_typical_miss-2f64d9)
![Coverage area](https://img.shields.io/badge/Data-City_of_Sydney-8c877d)

**Press `F` on any listing.**

</div>

---

## At a glance

| | |
|---|---|
| 💸 **Real price** | Likely sale from the agency's record of over/under-quoting, not the guide |
| 🔮 **Rent prediction** | Our own model prices every City of Sydney apartment, with and without a car space ($42/wk typical miss) |
| 📆 **Weekly cost** | Yield and what you're out of pocket each week, from the predicted rent |
| 🏗️ **Supply timing** | New homes and build-to-rent within 1 km, timed against your hold |
| ⚠️ **Hazards** | Flood, heritage, bushfire, power lines, public housing in the building |
| 🤖 **Your analyst** | Ask anything, get a short answer and a visual card |
| 📊 **Shortlist** | A spreadsheet of everything you've saved, incl. model rent, with your own formulas |

## The problem

If you're buying an investment property today, you've got two options:

1. **Gut feel.** Scroll REA and Domain, find something you like, and trust the selling agent, whose job is to get you to buy it.
2. **Become a super-user.** Build a spreadsheet and stitch together five sites: RP Data for rents, risk overlays from one site, development applications from another.

Either way, you're not making an informed decision quickly. Meanwhile:

- **More than half of Australia's 2.3 million landlords** made a rental loss last year (ATO 2023–24).
- **In Sydney, homes that beat their price guide sold a median $117,500 over the top of it** (Homer data, May 2026).
- New supply, especially build-to-rent towers, can land right when you need to re-lease, and nothing on the listing tells you when.

In investors' own words: *"The hardest part is knowing whether you're overpaying."* And: *"I don't want to waste money on overlapping platforms that don't add much."*

## What Fine Print does

Open any REA or Domain listing and press **F**. A panel slides in beside the listing, scored against your own investor brief (budget, deposit, minimum yield, hold period).

### On every listing
- **What you'll really pay:** a likely sale price based on the agency's record of selling over or under its quotes, plus the estimated value, asking price and your budget on one gauge.
- **What it should rent for:** our own rent model (LightGBM + CatBoost) predicts this exact apartment's weekly rent, with and without a car space, so you see what parking is worth. It priced all 65,777 City of Sydney apartments and misses by **$42 a week** typically, about half the Microburbs benchmark's $86 ([report](docs/rent-model-report.html)). Where it doesn't cover a property, the median of similar rentals within 1 km is used.
- **What it costs you each week:** gross yield and your out-of-pocket weekly cost against your deposit, worked out from that rent.
- **Rental listings too:** on a for-rent listing, see the asking rent against the model's prediction.
- **When supply lands:** new homes and build-to-rent within 1 km, timed against the years of your hold ("build-to-rent wave around 2031, year 6 of 10").
- **What the listing doesn't say:** tappable signals for supply, timing, agency quoting, value vs asking, rent and hazards.
- **Hazards and public housing:** flood, heritage, bushfire and power lines, plus public housing in the same building or nearby (City of Sydney list).
- **Tooltips everywhere:** hover any number to see where it comes from.

### Your own analyst
- Ask anything ("What should I offer?", "Is the new supply a dealbreaker?") and get a short answer with a visual card: cash flow, offer range, value, supply timeline, area comparison, hold scenario or hazards.
- Suggested follow-up questions for each listing.
- It remembers every property you've looked at, so it can compare ("cheaper to hold than the Waterloo one you saw yesterday").

### The shortlist
- Shortlist any listing from the panel (or press **S** with the panel open). Click the toolbar icon to open the shortlist.
- A spreadsheet of every shortlisted property with all its Microburbs figures: sort, filter (`>800k`, `4-6`, `!btr`), reorder and hide columns, with property and suburb pinned.
- Add your own columns, including **formulas** (`rent * 52 / my_offer * 100` = yield at your offer). Copy to Excel or Sheets, or export CSV.

### Built to be taken up
- No sign-up. Works on both portals. One key to open.
- A friendly "outside our data area" message for listings beyond the City of Sydney (the hackathon data's coverage).

## Keyboard shortcuts

| Key | Where | Does |
|---|---|---|
| `F` | any REA or Domain listing | Open or close Fine Print |
| `S` | panel open | Shortlist this property |
| `/` | shortlist | Search every column |
| `↑ ↓ ← →` · `Tab` | shortlist | Move between cells |
| `Enter` · double-click | shortlist | Edit your own columns |
| `⌘C` | shortlist | Copy the table for Excel or Sheets |

## Install (judges)

1. Unzip `fine-print-extension.zip` (supplied with our submission).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. Open any realestate.com.au or Domain listing in the City of Sydney and press **F**.
4. First run: paste an **OpenRouter** API key and the **Microburbs** API key, then set your brief (four inputs). Keys stay in your browser.

The analyst runs on DeepSeek V4.1 Flash via OpenRouter. Settings has a **Reset everything** button to replay the new-user experience.

## Build from source

```bash
cd extension
npm install
npm test                                  # 93 unit tests
npm run prepare:public-housing -- <path/to/public-housing-homes-city-of-sydney.csv>   # optional, see below
npm run prepare:rent-model -- <path/to/rents_FinePrintPredictions.csv> <path/to/chosen.json>   # optional, see below
npm run build                             # → extension/dist (load this folder in Chrome)
```

More detail on the agent runtime and code layout: [`extension/README.md`](extension/README.md).

## Data

- **Microburbs is the source of truth** for every figure: valuation, agency quoting record, rentals, sales, development applications, market and hazards. Calculations (yield, weekly cost, supply timing) are done in code, never by the model.
- **Supplied hackathon files are not republished.** The public-housing CSV is turned into a small lookup at build time (`npm run prepare:public-housing`). It's git-ignored and ships only inside the built extension. Without it, everything works except the public housing flag.
- **Our own rent model** (LightGBM + CatBoost, trained on City of Sydney leases to 31 Jul 2026; typical miss **$42/wk** on a sealed Jun–Jul 2026 test vs $86 for the Microburbs benchmark, 80.8% within $100; [full report](docs/rent-model-report.html)) is the one figure not from Microburbs, and it's labelled "our rent model" wherever it appears. Its predictions for 65,777 City of Sydney apartments (with and without a car space) are bundled the same way (`npm run prepare:rent-model`, git-ignored). When it covers the apartment, its rent drives yield and weekly cost; otherwise the nearby-rentals median does.
- **Nothing leaves your browser** except calls to Microburbs and OpenRouter. Your brief, keys, shortlist and saved properties are stored locally.
- Supply timing is an estimate (lodgement + approval + build time by size, ±1 year) and is labelled as one. General information, not financial advice.

## Repo

| Folder | What |
|---|---|
| `extension/` | The Chrome extension (MV3): panel, agent, shortlist, settings |
| `address-pipeline/` | Address parsing and exact GNAF matching |
| `pitch/` | Pitch script, demo run order, business case · [slide deck](pitch/deck/index.html) |
| `docs/` | [Rent model report](docs/rent-model-report.html) (Task 4): method, validation, what drives the prediction |
| `design/` | Design references |

---

<div align="center"><sub>Data by <b>Microburbs</b> · general information, not financial advice · built in a day for the Microburbs AI Hackathon 2026</sub></div>

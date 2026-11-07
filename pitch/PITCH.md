# Fine Print — pitch

Two parts: a **45-second team pitch** (just us talking, no screen) and a **short demo**.

---

**Recorded:** pitch [`45s.mp4`](45s.mp4) (39 s) · demo [`demo.mp4`](demo.mp4) (2 min 14 s).

## Part 1 · 45-second pitch (~120 words)

Problem → product → business. One idea per speaker; speak slower than feels natural. Slides follow along (deck slides 1–7, notes carry these lines), but the pitch works with no screen at all.

**Jake — the problem (~20s)** · slides 1–4

> If you're buying an investment property today, you've got two options.
>
> Gut feel: scroll REA and Domain and trust the selling agent, who wants you to buy.
>
> Or become a super-user: a spreadsheet, RP Data, risk overlays from one site, development applications from another.
>
> Either way, you're not making an informed decision, quickly.

**Carlos — what we built (~12s)** · slide 5

> Fine Print puts that research on the listing itself. Press F: the real price, what it'll rent for from our own model, your weekly cost, and when new supply lands.

**Jake — the business (~13s)** · slides 6–7

> It's your own intelligent investment analyst. Free to read, paid for power users, and 2.3 million Australians own a rental. At scale, it's live demand data for developers. Fine Print: read it before you buy it.

Then: slide 8, "Press F.", and into the demo. Slide 9 (take-up: no sign-up, both portals, 13M on REA vs ~10K for the leading extension) is a Q&A backup.

---

## Part 2 · Demo (~90s, one driver, one narrator)

The demo shows the third way: the super-user's research, in seconds, on the listing. Numbers in [brackets] come off the panel on the day; skip any beat whose number doesn't come back.

1. **Press F (0:00–0:10)** — on the REA listing. *"Gut-feel buyer sees this page. Press F."* Panel slides in, already scored against my brief.
2. **The evidence the agent won't give you (0:10–0:35)** — *"Guide says [$850K]; this agency sells [1.4% under] its quotes, so likely [$838K] — [over] my budget. Our rent model says this apartment rents for [$775] a week, [$20] more with a car space; that's [4.7%] yield and [$181] a week out of my pocket."*
3. **The super-user research, done (0:35–0:55)** — risks and the new-homes card. *"[504] build-to-rent homes finish within a kilometre around [2031] — year [5] of my hold. That's the development-application digging, done for me."*
4. **Talk to it (0:55–1:10)** — tap a suggested question, e.g. "What should I offer?" *"It's my intelligent investment analyst — it knows my brief, so the answer's about my numbers."* (Warm this listing first; if the answer is slow, cut to a pre-recorded take.)
5. **Both portals (1:10–1:20)** — switch to the organisers' Waterloo listing on Domain. *"Same on Domain — your Waterloo example."*
6. **The shortlist (1:20–1:35)** — click the toolbar icon. *"Everything I shortlist lands here: the super-user's spreadsheet, built for me. Sort by yield, add my own formula, copy to Excel."*

## Business case (slide 6 · the detail behind Jake's closing line, for Q&A)

**In the 45 seconds** it's Jake's closing line (slide 6): free to read, paid for power users, 2.3 million Australians own a rental, and at scale live demand data for developers.

**1. Investor subscription: free to read, paid for power users.** Pricing is still to be worked out; the numbers below are illustrative at **$15 a month ($180 a year)**.

| | Who | Size | At $180/yr |
|---|---|---|---|
| **TAM** | Australians with a rental property | 2,335,540 (ATO 2023–24) | **≈ $420M** |
| **SAM** | New investor loans a year | ≈ 210K (52,599 in the June qtr 2026 × 4, ABS) | **≈ $38M** |
| **SOM** | 1% of landlords: about 2× today's leading listing extension (Homer, ~10K users) | ≈ 23K | **≈ $4.2M ARR** |

Comparable tools charge $9.99/month (Property Mate) up to $77–$320/month (Microburbs investor plans), and investors already pay for several (r/AusFinance: five platforms). What's paid vs free is still open; candidates are unlimited reads, the analyst, and shortlist export.

**2. At critical mass: demand insights for developers.** Every read and shortlist is a live signal of what investors want: suburb, bedrooms, price point, and what they walk away from. Aggregated and opt-in, it's demand data that developers and build-to-rent operators can use *before they build*. It also feeds back to Microburbs.

**Honest caveats if asked:** pricing isn't validated, and the insights product needs scale plus a clear consent model first. The extension is free today.

## Before recording

- [ ] Extension reloaded from `extension/dist`; investor brief set (budget, deposit, min yield, hold years)
- [ ] Tabs open: Zetland (REA), the organisers' Waterloo example, a second Domain listing as backup
- [ ] Every listing opened once already (cache warm → instant on camera; the API rate-limits)
- [ ] 3–4 properties shortlisted, a "My offer" typed on one
- [ ] Pick a listing where the supply card has real numbers — it's our differentiator
- [ ] Close other tabs, hide bookmarks bar, 100% zoom

## Wording we avoid

- **"54% of landlords lost money"** — invites "that's negative gearing, on purpose". Our problem is *visibility*, not loss.
- **"Only one showing development"** — Property Mate has a development radar. Our claim is *timing against your hold* plus weekly cost.
- **"None does the investor's maths"** — YieldMate shows yield. Say "none tells you what it'll cost you each week".
- **"Sales agent" for our AI** — judges will hear the real-estate agent. Say "intelligent investment analyst".
- **Free tier → Microburbs subscription** — not built. Frame the business case as distribution: Microburbs data at the moment of decision.

## Claims and sources (for the Q&A)

| Line | Source |
|---|---|
| 2.3M landlords, 1.27M (54%) made a rental loss | ATO Taxation Statistics 2023–24, Table 8 |
| Sydney above-guide sales a median $117,500 over the top of range | Homer data via Mortgage Professional Australia, May 2026 |
| 13M Australians on REA a month | REA / Ipsos iris, Oct 2025 |
| ~10,000 users for the category leader | Chrome Web Store (Homer), 7 Nov 2026 |
| NSW build-to-rent pipeline ~17,000 homes | BDO build-to-rent data 2026 |
| Agency quoting record | Microburbs API (per listing) |

**If asked "isn't Sydney under-supplied?":** yes, city-wide. Our point is that risk is local and timed — a build-to-rent tower finishing 300 m away in year 2 of your hold matters even in a short market.

**If asked "how is supply timing worked out?":** completion ≈ lodgement + about 9 months to approval + 18–42 months to build by size, spread over ±1 year. Stated as an estimate in the panel.

**Don't claim** "the only one that shows development" — Property Mate has a development radar. Our claim is *timing against your hold* plus the investor maths.

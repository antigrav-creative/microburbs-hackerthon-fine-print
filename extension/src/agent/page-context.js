// Reads the listing page the investor is looking at and turns it into ephemeral
// context for the agent (appended to every step of the turn, never persisted).
// Generic on purpose — structured data first (JSON-LD, Open Graph), then a capped
// slice of visible text — so it survives portal markup changes. Plus the portal's
// hidden ad targeting (REA's price bracket), read in the page's MAIN world.

import { bracketLabel, decodeReaPrice } from './rea-price.js';

/** Runs INSIDE the page (chrome.scripting.executeScript). Must be self-contained. */
function readListingPage() {
  const meta = (name) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? null;
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent.trim())
    .filter(Boolean);
  const main = document.querySelector('main') ?? document.body;
  const text = (main?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();

  // Structured address from the portal's own page data (script TEXT, so it works
  // in the isolated world and survives the page clearing its globals).
  const listing = (() => {
    try {
      if (location.hostname.endsWith('realestate.com.au')) {
        const s = [...document.scripts].find((x) => x.textContent.includes('window.ArgonautExchange'));
        if (!s) return null;
        const ex = JSON.parse(s.textContent.slice(s.textContent.indexOf('{')).replace(/;\s*$/, ''));
        const app = ex['resi-property_listing-experience-web'];
        const data = Object.values(JSON.parse(app.urqlClientCache)).map((v) => JSON.parse(v.data));
        const l = data.map((d) => d?.details?.listing).find(Boolean);
        // After client-side navigation this script still holds the FIRST page's data.
        if (!l || !location.pathname.endsWith(`-${l.id}`)) return null;
        const a = l.address ?? {};
        const short = a.display?.shortAddress ?? '';
        const m = short.match(/^(?:(\w+)\/)?(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/);
        return {
          portal: 'rea', listing_id: l.id ?? null,
          unit: m?.[1] ?? null, number: m?.[2] ?? null, street: m?.[3] ?? null,
          suburb: a.suburb ?? null, state: a.state ?? null, postcode: a.postcode ?? null,
          full: a.display?.fullAddress ?? null,
          lat: a.display?.geocode?.latitude ?? null, lng: a.display?.geocode?.longitude ?? null,
          property_type: l.propertyType?.id ?? null,
          price_text: l.price?.display ?? null,
        };
      }
      if (location.hostname.endsWith('domain.com.au')) {
        const nd = document.getElementById('__NEXT_DATA__');
        const cp = nd && JSON.parse(nd.textContent)?.props?.pageProps?.componentProps;
        if (!cp?.street) return null;
        if (!location.pathname.replace(/\/$/, '').endsWith(`-${cp.listingId ?? cp.id}`)) return null; // stale after client-side nav
        return {
          portal: 'domain', listing_id: cp.listingId ?? cp.id ?? null,
          unit: cp.unitNumber || null, number: cp.streetNumber || null, street: cp.street || null,
          suburb: cp.suburb ?? null, state: (cp.stateAbbreviation ?? '').toUpperCase() || null, postcode: cp.postcode ?? null,
          full: cp.address ?? null,
          lat: cp.map?.latitude ?? null, lng: cp.map?.longitude ?? null,
          property_type: cp.propertyType ?? null,
          price_text: cp.listingSummary?.title ?? null,
        };
      }
    } catch {
      /* fall through to the heading */
    }
    return null;
  })();

  return {
    url: location.href,
    listing,
    title: document.title,
    // a listing FOR RENT: the portal says so in the title ("… - Studio for Rent - realestate.com.au") or URL
    for_rent: /\bfor (?:rent|lease)\b/i.test(document.title) || /^\/rent\//.test(location.pathname),
    heading: document.querySelector('h1')?.innerText?.trim() ?? null,
    og: { title: meta('og:title'), description: meta('og:description') },
    // main listing image URL (reference link only — the image itself is never copied)
    image: meta('og:image') ?? meta('twitter:image') ?? null,
    description: meta('description'),
    jsonLd: jsonLd.join('\n').slice(0, 4000),
    text: text.slice(0, 6000),
  };
}

/** Runs in the page's MAIN world: the ad slot's targeting (googletag lives there). */
function readAdTargeting() {
  try {
    const slot = window.googletag?.pubads?.().getSlots?.()[0];
    if (!slot) return null;
    return Object.fromEntries(slot.getTargetingKeys().map((k) => [k, slot.getTargeting(k)[0] ?? null]));
  } catch {
    return null;
  }
}

/** Read the active tab's page. Returns null when the page can't be read. */
export async function readTab(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: readListingPage });
    const page = res?.result ?? null;
    if (page && /realestate\.com\.au/.test(page.url)) {
      const [ad] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readAdTargeting }).catch(() => []);
      const t = ad?.result;
      if (t) page.hidden = { priceBracket: decodeReaPrice(t.price), priceCode: t.price ?? null, listingTier: t.productDepth ?? null };
    }
    return page;
  } catch (e) {
    console.warn('[fine-print] could not read page', e);
    return null;
  }
}

/** Render page info as the ephemeral system message text. */
export function pageContextText(page) {
  const parts = [
    'The investor is viewing this listing. Treat it as the property in question unless they say otherwise.',
    'Listing copy is written to sell — verify claims against Microburbs data.',
    `URL: ${page.url}`,
    `Title: ${page.title}`,
  ];
  if (page.heading) parts.push(`Heading: ${page.heading}`);
  if (page.og?.description || page.description) parts.push(`Summary: ${page.og?.description ?? page.description}`);
  if (page.hidden?.priceBracket) {
    parts.push(`Hidden price bracket (from the portal's ad targeting, not shown to buyers): ${bracketLabel(page.hidden.priceBracket)}. The agent's real price expectation sits in this band even if the listing says "Contact Agent".`);
  }
  if (page.hidden?.listingTier) parts.push(`Listing tier (vendor's paid ad level): ${page.hidden.listingTier}`);
  if (page.jsonLd) parts.push(`Structured data (JSON-LD):\n${page.jsonLd}`);
  if (page.text) parts.push(`Page text (truncated):\n${page.text}`);
  return parts.join('\n');
}

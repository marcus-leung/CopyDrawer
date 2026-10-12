/**
 * Rule-based sorting into collections. Fast, offline, deterministic.
 */
import type { Clip } from './db';
import { hostOf } from './format';
import { findAddress, findTracking } from './actions';

export type CategoryId = 'research' | 'links' | 'code' | 'shopping' | 'recipes' | 'travel' | 'personal';

interface CategoryDef {
  id: CategoryId;
  name: string;
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  research: {
    id: 'research',
    name: 'Research',
  },
  links: { id: 'links', name: 'Links' },
  code: {
    id: 'code',
    name: 'Code',
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping',
  },
  recipes: {
    id: 'recipes',
    name: 'Recipes',
  },
  travel: {
    id: 'travel',
    name: 'Travel',
  },
  personal: {
    id: 'personal',
    name: 'Personal',
  },
};

// prettier-ignore
const DOMAINS: Partial<Record<CategoryId, string[]>> = {
  research: [
    'wikipedia.org', 'britannica.com', 'khanacademy.org', 'arxiv.org', 'scholar.google.com', 'jstor.org', 'nature.com',
    'sciencedirect.com', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'researchgate.net', 'owl.purdue.edu', 'coursera.org',
    'edx.org', 'quizlet.com', 'chegg.com', 'investopedia.com', 'plato.stanford.edu', 'semanticscholar.org',
  ],
  code: [
    'github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org', 'npmjs.com', 'pypi.org',
    'docs.python.org', 'learn.microsoft.com', 'codepen.io', 'codesandbox.io', 'replit.com',
  ],
  shopping: [
    'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'ebay.com', 'etsy.com', 'walmart.com', 'target.com',
    'bestbuy.com', 'ikea.com', 'rei.com', 'aliexpress.com', 'zara.com', 'hm.com', 'nike.com', 'adidas.com', 'wayfair.com',
    'costco.com', 'homedepot.com', 'lowes.com', 'shein.com', 'temu.com', 'uniqlo.com', 'apple.com/shop', 'newegg.com',
  ],
  recipes: [
    'allrecipes.com', 'cooking.nytimes.com', 'nytcooking.com', 'bbcgoodfood.com', 'seriouseats.com', 'food52.com',
    'epicurious.com', 'bonappetit.com', 'foodnetwork.com', 'tasty.co', 'delish.com', 'simplyrecipes.com', 'budgetbytes.com',
  ],
  travel: [
    'airbnb.com', 'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'kayak.com', 'skyscanner.net',
    'skyscanner.com', 'google.com/travel', 'vrbo.com', 'hostelworld.com', 'agoda.com', 'lonelyplanet.com', 'timeout.com',
    'ryanair.com', 'easyjet.com', 'united.com', 'delta.com', 'aa.com', 'britishairways.com', 'flytap.com', 'lufthansa.com',
    'airfrance.com', 'klm.com', 'emirates.com', 'southwest.com', 'jetblue.com', 'trainline.com', 'rome2rio.com', 'getyourguide.com',
  ],
};

const RE = {
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  phone: /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/,
  flight: /\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b.*\b(?:[A-Z]{3})\b|\bflight\b/i,
  travelWords:
    /\b(check-?in|check-?out|itinerary|boarding|hotel|hostel|airbnb|apartment rental|nights?|departure|arrival|layover|round trip|one way)\b/i,
  recipeWords:
    /\b(\d+\s?(?:tbsp|tsp|cups?|grams?|g|ml|oz|lb)s?\b|preheat|tablespoons?|teaspoons?|ingredients|simmer|whisk|bake for)\b/i,
  shopWords: /\b(add to (?:cart|bag|basket)|in stock|free shipping|out of stock|buy now)\b/i,
  price: /(?:[$€£¥₹]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|GBP|CAD|AUD))/,
};

function domainMatches(url: string | undefined, list: string[] = []): boolean {
  if (!url) return false;
  const host = hostOf(url);
  if (!host) return false;
  const path = URL.canParse(url) ? new URL(url).pathname : '';
  return list.some((d) => {
    const [dHost, ...rest] = d.split('/');
    const dPath = rest.length ? `/${rest.join('/')}` : '';
    return (host === dHost || host.endsWith(`.${dHost}`)) && (!dPath || path.startsWith(dPath));
  });
}

/** The page a clip came from, or the clip itself when it's a link. */
function urlsOf(clip: Pick<Clip, 'kind' | 'text' | 'source'>): string[] {
  const urls = [clip.source?.url].filter(Boolean) as string[];
  if (clip.kind === 'link') urls.unshift(clip.text.trim().startsWith('www.') ? `https://${clip.text.trim()}` : clip.text.trim());
  return urls;
}

/** Returns a category when the rules are confident, otherwise undefined. */
export function classifyByRules(clip: Pick<Clip, 'kind' | 'text' | 'title' | 'source'>): CategoryId | undefined {
  const text = `${clip.title}\n${clip.text}`;
  const urls = urlsOf(clip);
  const fromDomain = (cat: CategoryId) => urls.some((u) => domainMatches(u, DOMAINS[cat]));

  if (clip.kind === 'code' || clip.kind === 'json') return 'code';
  if (fromDomain('travel') || (RE.travelWords.test(text) && (RE.flight.test(text) || RE.price.test(text)))) return 'travel';
  if (fromDomain('recipes') || (RE.recipeWords.test(text) && /\b(cup|tbsp|tsp|preheat|ingredients)\b/i.test(text)))
    return 'recipes';
  if (fromDomain('shopping') || RE.shopWords.test(text) || (clip.kind === 'text' && findTracking(text))) return 'shopping';
  if (fromDomain('code')) return 'code';
  if (fromDomain('research')) return 'research';
  if (clip.kind === 'link') return 'links';
  // Plans in a known destination ("Fado at … Lisbon. Tickets €35") belong with the trip.
  if (clip.kind !== 'image' && (RE.price.test(text) || RE.travelWords.test(text)) && detectDestination(text)) return 'travel';
  if (clip.kind !== 'image' && (RE.email.test(text) || findAddress(text) !== null) && text.length < 300) return 'personal';
  if (clip.kind !== 'image' && RE.phone.test(text) && text.length < 120) return 'personal';
  return undefined;
}

/** A small gazetteer of popular destinations used to name trips ("Lisbon trip"). */
// prettier-ignore
const CITIES = [
  'Amsterdam', 'Athens', 'Auckland', 'Austin', 'Bali', 'Bangkok', 'Barcelona', 'Beijing', 'Berlin', 'Bogotá', 'Boston',
  'Brussels', 'Budapest', 'Buenos Aires', 'Cairo', 'Cancún', 'Cape Town', 'Chicago', 'Copenhagen', 'Dubai', 'Dublin',
  'Edinburgh', 'Florence', 'Hanoi', 'Havana', 'Helsinki', 'Ho Chi Minh City', 'Hong Kong', 'Honolulu', 'Istanbul', 'Jakarta',
  'Kyoto', 'Las Vegas', 'Lima', 'Lisbon', 'London', 'Los Angeles', 'Madrid', 'Marrakech', 'Melbourne', 'Mexico City', 'Miami',
  'Milan', 'Montreal', 'Munich', 'Nairobi', 'Naples', 'New Orleans', 'New York', 'Nice', 'Osaka', 'Oslo', 'Paris', 'Porto',
  'Prague', 'Reykjavik', 'Rio de Janeiro', 'Rome', 'San Diego', 'San Francisco', 'Santorini', 'São Paulo', 'Seattle', 'Seoul',
  'Seville', 'Shanghai', 'Singapore', 'Stockholm', 'Sydney', 'Taipei', 'Tokyo', 'Toronto', 'Tulum', 'Vancouver', 'Venice',
  'Vienna', 'Warsaw', 'Washington', 'Zurich', 'Sintra', 'Belém', 'Alfama', 'Chiado',
];
/** Neighborhoods and day-trip spots that belong to a bigger destination. */
const PARENT: Record<string, string> = { Sintra: 'Lisbon', Belém: 'Lisbon', Alfama: 'Lisbon', Chiado: 'Lisbon' };

// Case-sensitive (cities are proper nouns: "Nice" the city, not "a nice day"), Unicode-aware edges.
const CITY_PATTERNS = CITIES.map(
  (city) => [city, new RegExp(`(?<![\\p{L}])${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')] as const,
);

export function detectDestination(text: string): string | undefined {
  const counts = new Map<string, number>();
  for (const [city, re] of CITY_PATTERNS) {
    const n = text.match(re)?.length ?? 0;
    if (n) {
      const key = PARENT[city] ?? city;
      counts.set(key, (counts.get(key) ?? 0) + n);
    }
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [city, n] of counts) {
    if (n > bestN) {
      best = city;
      bestN = n;
    }
  }
  return best;
}

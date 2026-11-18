// Use the visitor's preferred language to resolve multilingual IP regions.
const localLanguages = new Map<string, readonly string[]>();
function mapCountries(countries: string, ...languages: string[]) {
  for (const country of countries.split(' ')) localLanguages.set(country, languages);
}
mapCountries('AR BO CL CO CR CU DO EC ES GQ GT HN MX NI PA PE PR PY SV UY VE', 'es');
mapCountries('FR MC SN CI TG BJ GA GF GP MQ RE', 'fr');
mapCountries('AT DE LI', 'de');
mapCountries('IN', 'hi');
mapCountries('IT SM VA', 'it');
mapCountries('AO BR CV GW MZ PT ST', 'pt');
mapCountries('NL SR', 'nl');
mapCountries('AE BH EG IQ JO KW LB OM PS QA SA SY YE', 'ar');
mapCountries('JP', 'ja');
mapCountries('KR', 'ko');
mapCountries('CA', 'en', 'fr');
mapCountries('BE', 'nl', 'fr', 'de');
mapCountries('CH', 'de', 'fr', 'it');
mapCountries('LU', 'fr', 'de');
mapCountries('DZ MA TN', 'ar', 'fr');

const countryCache = 'kochi-headline-country-v1';

async function visitorCountry(signal: AbortSignal): Promise<string | undefined> {
  try {
    const cached = sessionStorage.getItem(countryCache);
    if (cached && /^[A-Z]{2}$/.test(cached)) return cached;
  } catch { /* Storage may be disabled. */ }

  const sources = ['/cdn-cgi/trace', 'https://api.country.is/'];
  for (const url of sources) {
    if (signal.aborted) return;
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 2500);
    try {
      const response = await fetch(url, {
        signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      });
      if (!response.ok) continue;
      const country = url.startsWith('/')
        ? /^loc=([A-Z]{2})\s*$/m.exec(await response.text())?.[1]
        : (await response.json()).country;
      if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country) || country === 'XX') continue;
      try { sessionStorage.setItem(countryCache, country); } catch { /* Optional cache. */ }
      return country;
    } catch { /* Try the fallback on static hosts or when a lookup fails. */ }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }
}

export async function visitorLanguage(signal: AbortSignal): Promise<string> {
  const country = await visitorCountry(signal);
  const candidates = localLanguages.get(country ?? '') ?? ['en'];
  const preferred = navigator.languages.map(locale => locale.toLowerCase().split('-')[0]);
  return preferred.find(lang => candidates.includes(lang)) ?? candidates[0];
}

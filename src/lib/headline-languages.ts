export const ENGLISH_HEADLINE = 'Kochi Labs is cooking something';
export const HEADLINE_INTERVAL = 15_000;

export const HEADLINE_LANGUAGES = [
  { lang: 'en', text: ENGLISH_HEADLINE, hint: 'Click to change language' },
  { lang: 'es', text: 'Algo se está cocinando en Kochi Labs', hint: 'Haz clic para cambiar de idioma' },
  { lang: 'fr', text: 'Kochi Labs mijote quelque chose', hint: 'Cliquez pour changer de langue' },
  { lang: 'de', text: 'Bei Kochi Labs köchelt etwas', hint: 'Klicken, um die Sprache zu wechseln' },
  { lang: 'hi', text: 'Kochi Labs में कुछ पक रहा है', hint: 'भाषा बदलने के लिए क्लिक करें' },
  { lang: 'it', text: 'Qualcosa bolle in pentola da Kochi Labs', hint: 'Fai clic per cambiare lingua' },
  { lang: 'pt', text: 'A Kochi Labs está preparando algo', hint: 'Clique para mudar de idioma' },
  { lang: 'nl', text: 'Bij Kochi Labs staat iets te pruttelen', hint: 'Klik om van taal te wisselen' },
  { lang: 'ar', text: 'هناك شيء يُطبخ في Kochi Labs', hint: 'انقر لتغيير اللغة' },
  { lang: 'ja', text: 'Kochi Labs で何かを仕込み中', hint: 'クリックして言語を切り替え' },
  { lang: 'ko', text: 'Kochi Labs에서 무언가를 준비하고 있어요', hint: '클릭하여 언어 변경' },
] as const;

type Headline = typeof HEADLINE_LANGUAGES[number];
type LanguageCode = Headline['lang'];

// Ordered candidates provide a default when no regional preference is available.
const localLanguages = new Map<string, readonly LanguageCode[]>();
function mapCountries(countries: string, ...languages: LanguageCode[]) {
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

export function headlineForCountry(country: string, preferences: readonly string[]): Headline {
  const candidates = localLanguages.get(country.toUpperCase()) ?? ['en'];
  const preferred = preferences.map(locale => locale.toLowerCase().split('-')[0])
    .find(lang => candidates.some(candidate => candidate === lang));
  return HEADLINE_LANGUAGES.find(language => language.lang === (preferred ?? candidates[0])) ?? HEADLINE_LANGUAGES[0];
}

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

export function installHeadlineLanguages(button: HTMLButtonElement, onChange?: (language: Headline) => void): () => void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lookup = new AbortController();
  const english = HEADLINE_LANGUAGES[0];
  let language: Headline = english;
  let local: Headline = english;
  let hovered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function paint() {
    button.disabled = local.lang === 'en';
    button.lang = language.lang;
    button.dir = language.lang === 'ar' ? 'rtl' : 'ltr';
    button.dataset.language = language.lang;
    button.textContent = language.text;
    if (button.disabled) {
      button.removeAttribute('title');
      button.removeAttribute('aria-label');
    } else {
      button.title = language.hint;
      button.setAttribute('aria-label', `${language.text} ${language.hint}`);
    }
    button.setAttribute('aria-live', 'off');
    onChange?.(language);
  }

  function stop() { clearTimeout(timer); }
  function schedule() {
    stop();
    if (button.disabled || document.hidden || hovered || document.activeElement === button || reducedMotion.matches) return;
    const readTime = language.text.trim().split(/\s+/).length * 400 + 1000;
    timer = setTimeout(advance, Math.max(HEADLINE_INTERVAL, readTime));
  }
  function advance() {
    if (button.disabled) return;
    language = language.lang === 'en' ? local : english;
    paint();
    schedule();
  }
  function enter(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    hovered = true;
    stop();
  }
  function leave() { hovered = false; schedule(); }

  button.addEventListener('click', advance);
  button.addEventListener('pointerenter', enter);
  button.addEventListener('pointerleave', leave);
  button.addEventListener('pointercancel', leave);
  button.addEventListener('focus', stop);
  button.addEventListener('blur', schedule);
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  paint();
  void visitorCountry(lookup.signal).then(country => {
    if (!country || lookup.signal.aborted) return;
    local = headlineForCountry(country, navigator.languages);
    paint();
    schedule();
  });

  return () => {
    lookup.abort();
    stop();
    button.removeEventListener('click', advance);
    button.removeEventListener('pointerenter', enter);
    button.removeEventListener('pointerleave', leave);
    button.removeEventListener('pointercancel', leave);
    button.removeEventListener('focus', stop);
    button.removeEventListener('blur', schedule);
    document.removeEventListener('visibilitychange', schedule);
    reducedMotion.removeEventListener('change', schedule);
  };
}

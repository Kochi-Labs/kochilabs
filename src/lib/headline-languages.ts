export const ENGLISH_HEADLINE = 'We create intuitive digital products, scalable cloud-native solutions, and intelligent automations, combining cutting-edge engineering, purposeful design, and research-driven innovation to simplify everyday life.';
export const HEADLINE_INTERVAL = 15_000;

export const HEADLINE_LANGUAGES = [
  { lang: 'en', text: ENGLISH_HEADLINE, hint: 'Click to change language' },
  { lang: 'es', text: 'Creamos productos digitales intuitivos, soluciones nativas de la nube que crecen según las necesidades y automatizaciones inteligentes. Combinamos ingeniería de vanguardia, diseño con propósito e innovación basada en la investigación para simplificar la vida cotidiana.', hint: 'Haz clic para cambiar de idioma' },
  { lang: 'fr', text: 'Nous créons des produits numériques intuitifs, des solutions cloud natives évolutives et des automatisations intelligentes. Nous associons ingénierie de pointe, design pensé pour les usages et innovation issue de la recherche pour simplifier le quotidien.', hint: 'Cliquez pour changer de langue' },
  { lang: 'de', text: 'Wir entwickeln intuitive digitale Produkte, skalierbare Cloud-native-Lösungen und intelligente Automatisierungen. Dafür verbinden wir modernste Technik mit durchdachtem Design und Innovationen aus der Forschung, um den Alltag zu erleichtern.', hint: 'Klicken, um die Sprache zu wechseln' },
  { lang: 'hi', text: 'हम ऐसे डिजिटल उत्पाद बनाते हैं जिनका इस्तेमाल आसान हो, ऐसे क्लाउड-नेटिव समाधान जो ज़रूरत के साथ बढ़ सकें, और समझदारी से काम करने वाली स्वचालित प्रणालियाँ। रोज़मर्रा की ज़िंदगी को आसान बनाने के लिए हम उन्नत इंजीनियरिंग, सोच-समझकर किए गए डिज़ाइन और शोध से उपजे नए विचारों को साथ लाते हैं।', hint: 'भाषा बदलने के लिए क्लिक करें' },
  { lang: 'it', text: 'Creiamo prodotti digitali intuitivi, soluzioni cloud native scalabili e automazioni intelligenti. Uniamo ingegneria all’avanguardia, design attento alle esigenze delle persone e innovazione guidata dalla ricerca per semplificare la vita quotidiana.', hint: 'Fai clic per cambiare lingua' },
  { lang: 'pt', text: 'Criamos produtos digitais intuitivos, soluções nativas da nuvem que crescem conforme a necessidade e automações inteligentes. Unimos engenharia de ponta, design com propósito e inovação baseada em pesquisa para simplificar a vida cotidiana.', hint: 'Clique para mudar de idioma' },
  { lang: 'nl', text: 'We maken intuïtieve digitale producten, schaalbare cloudnative oplossingen en slimme automatiseringen. Met geavanceerde technologie, doordacht ontwerp en vernieuwing vanuit onderzoek maken we het dagelijks leven eenvoudiger.', hint: 'Klik om van taal te wisselen' },
  { lang: 'ar', text: 'نبتكر منتجات رقمية سهلة الاستخدام، وحلولًا مصممة للبيئات السحابية قابلة للتوسع، وأنظمة أتمتة ذكية. نجمع بين الهندسة المتقدمة والتصميم الهادف والابتكار القائم على البحث لتبسيط الحياة اليومية.', hint: 'انقر لتغيير اللغة' },
  { lang: 'ja', text: '私たちは、直感的に使えるデジタル製品、柔軟に拡張できるクラウドネイティブなソリューション、そしてインテリジェントな自動化の仕組みをつくります。先端技術と目的に即したデザイン、研究から生まれる新しい発想を組み合わせ、日々の暮らしをもっとシンプルにします。', hint: 'クリックして言語を切り替え' },
  { lang: 'ko', text: '우리는 직관적인 디지털 제품과 유연하게 확장할 수 있는 클라우드 네이티브 솔루션, 지능형 자동화 시스템을 만듭니다. 첨단 엔지니어링과 목적에 맞는 디자인, 연구에서 얻은 새로운 아이디어를 결합해 일상을 더 편리하게 만듭니다.', hint: '클릭하여 언어 변경' },
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

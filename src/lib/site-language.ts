import { languages, translations, type Language } from './translations';
import { visitorLanguage } from './visitor-language';

const preferenceKey = 'kochi-labs-language';
const changes = new EventTarget();
let language: Language = 'en';
let lookup: AbortController | undefined;

function supported(code: unknown): code is Language {
  return typeof code === 'string' && Object.hasOwn(languages, code);
}

export function currentLanguage() { return language; }

export function translate(source: string, value?: string | number) {
  const text = language === 'en' ? source : translations[source]?.[language] ?? source;
  return value === undefined ? text : text.replace('{value}', () => String(value));
}

export function onLanguageChange(render: () => void) {
  render();
  changes.addEventListener('change', render);
  return () => changes.removeEventListener('change', render);
}

function apply(code: Language) {
  language = code;
  document.documentElement.lang = code;
  changes.dispatchEvent(new Event('change'));
}

export function chooseLanguage(choice: string) {
  if (!supported(choice)) return;
  lookup?.abort();
  try { localStorage.setItem(preferenceKey, choice); } catch { /* The choice still applies for this visit. */ }
  apply(choice);
}

export function installSiteLanguage() {
  // Keep the original, server-rendered copy for switching back to English.
  const bindings: Array<() => void> = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    for (const field of el.dataset.i18n!.split(' ')) {
      if (field === 'text') {
        const source = el.textContent!;
        bindings.push(() => { el.textContent = translate(source); });
      } else {
        const source = el.getAttribute(field)!;
        bindings.push(() => el.setAttribute(field, translate(source)));
      }
    }
  }
  onLanguageChange(() => {
    for (const render of bindings) render();
  });

  let saved: string | null = null;
  try { saved = localStorage.getItem(preferenceKey); } catch { /* Storage is optional. */ }
  if (supported(saved)) {
    apply(saved);
    return;
  }
  lookup = new AbortController();
  const { signal } = lookup;
  void visitorLanguage(signal).then(code => {
    if (!signal.aborted && supported(code)) apply(code);
  });
}

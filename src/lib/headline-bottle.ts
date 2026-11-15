import type { HEADLINE_LANGUAGES } from './headline-languages';

type Language = typeof HEADLINE_LANGUAGES[number];
const messages = {
  en: ['Good things take their own sweet time.', 'Open the palm-leaf message'],
  es: ['Las cosas buenas llegan a su debido tiempo.', 'Abrir el mensaje en la hoja de palma'],
  fr: ['Les belles choses prennent leur temps.', 'Ouvrir le message sur feuille de palmier'],
  de: ['Gute Dinge brauchen ihre Zeit.', 'Die Palmblattbotschaft öffnen'],
  hi: ['अच्छी चीज़ें अपना समय लेती हैं।', 'ताड़पत्र पर लिखा संदेश खोलें'],
} as const;

/** Measure the actual final grapheme, preserving connected scripts and wrapped lines. */
export function installHangingBottle(headline: HTMLButtonElement, bottle: HTMLButtonElement, dialog: HTMLDialogElement) {
  const parent = headline.closest<HTMLElement>('.headline')!;
  const message = dialog.querySelector<HTMLElement>('#bottle-message')!;
  let language: Language['lang'] = 'en';
  let frame = 0;
  let destroyed = false;
  const measure = document.createElement('canvas').getContext('2d');

  function position() {
    if (destroyed) return;
    const text = headline.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return;
    const segments = Array.from(new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(text.textContent ?? ''));
    const last = segments.reverse().find(part => /\p{L}/u.test(part.segment));
    if (!last) return;
    const range = document.createRange();
    range.setStart(text, last.index);
    range.setEnd(text, last.index + last.segment.length);
    const glyph = range.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const style = getComputedStyle(headline);
    const fontSize = parseFloat(style.fontSize);
    let bottomInset = fontSize * .2;
    if (measure) {
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = measure.measureText(last.segment);
      bottomInset = (metrics.fontBoundingBoxDescent ?? fontSize * .25) - metrics.actualBoundingBoxDescent;
    }
    const attachment = last.segment === 'g' ? .22 : .52;
    bottle.style.left = `${glyph.left + glyph.width * attachment - bounds.left}px`;
    bottle.style.top = `${glyph.bottom - bounds.top - bottomInset - 3}px`;
    bottle.dataset.ready = 'true';
    bottle.dataset.anchor = last.segment;
  }
  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }
  function open() {
    message.textContent = messages[language][0];
    message.lang = language;
    if (!dialog.open) dialog.showModal();
  }
  const resize = new ResizeObserver(schedulePosition);
  resize.observe(headline);
  resize.observe(parent);
  window.addEventListener('resize', schedulePosition);
  document.fonts.addEventListener('loadingdone', schedulePosition);
  document.fonts.ready.then(schedulePosition);
  bottle.addEventListener('click', open);
  return {
    setLanguage(next: Language) {
      language = next.lang;
      bottle.lang = language;
      bottle.setAttribute('aria-label', messages[language][1]);
      bottle.title = messages[language][1];
      schedulePosition();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('resize', schedulePosition);
      document.fonts.removeEventListener('loadingdone', schedulePosition);
      bottle.removeEventListener('click', open);
    },
  };
}

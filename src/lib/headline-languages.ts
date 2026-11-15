export const HEADLINE_INTERVAL = 8_000;

/** Keep the coming-soon idiom natural in each language, rather than literal. */
export const HEADLINE_LANGUAGES = [
  { lang: 'en', text: 'God’s own country is cooking something.', hint: 'Click to change language' },
  { lang: 'es', text: 'Algo se está cocinando en la tierra de Dios.', hint: 'Haz clic para cambiar de idioma' },
  { lang: 'fr', text: 'Au pays de Dieu, quelque chose se prépare.', hint: 'Cliquez pour changer de langue' },
  { lang: 'de', text: 'In Gottes eigenem Land köchelt etwas.', hint: 'Klicken, um die Sprache zu wechseln' },
  { lang: 'hi', text: 'ईश्वर की अपनी धरती पर कुछ पक रहा है।', hint: 'भाषा बदलने के लिए क्लिक करें' },
] as const;

/** One readable eight-second dwell per language; a deliberate click advances it. */
export function installHeadlineLanguages(button: HTMLButtonElement, onChange?: (language: typeof HEADLINE_LANGUAGES[number]) => void): () => void {
  const interaction = button.closest<HTMLElement>('.headline') ?? button;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let hovered = false;
  let focused = document.activeElement === button;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function paint() {
    const language = HEADLINE_LANGUAGES[index]!;
    button.lang = language.lang;
    button.dataset.language = language.lang;
    button.textContent = language.text;
    button.title = language.hint;
    button.setAttribute('aria-label', `${language.text} ${language.hint}`);
    // Auto-rotation must not repeatedly interrupt screen-reader speech.
    button.setAttribute('aria-live', 'off');
    onChange?.(language);
  }

  function stop() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    stop();
    if (disposed || document.hidden || hovered || focused || reducedMotion.matches) return;
    timer = setTimeout(advance, HEADLINE_INTERVAL);
  }

  function advance() {
    if (disposed) return;
    index = (index + 1) % HEADLINE_LANGUAGES.length;
    paint();
    schedule();
  }

  function enter(event: PointerEvent) {
    // A touch tap advances once without leaving a phantom hover pause behind.
    if (event.pointerType === 'touch') return;
    hovered = true;
    stop();
  }
  function leave() { hovered = false; schedule(); }
  function focus() { focused = true; stop(); }
  function blur(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && interaction.contains(event.relatedTarget)) return;
    focused = false; schedule();
  }

  button.addEventListener('click', advance);
  interaction.addEventListener('pointerenter', enter);
  interaction.addEventListener('pointerleave', leave);
  interaction.addEventListener('pointercancel', leave);
  interaction.addEventListener('focusin', focus);
  interaction.addEventListener('focusout', blur);
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  paint();
  schedule();

  return () => {
    disposed = true;
    stop();
    button.removeEventListener('click', advance);
    interaction.removeEventListener('pointerenter', enter);
    interaction.removeEventListener('pointerleave', leave);
    interaction.removeEventListener('pointercancel', leave);
    interaction.removeEventListener('focusin', focus);
    interaction.removeEventListener('focusout', blur);
    document.removeEventListener('visibilitychange', schedule);
    reducedMotion.removeEventListener('change', schedule);
  };
}

import { visitorLanguage } from './visitor-language';
import { createPalmLeafScroll } from './palm-leaf-scroll';

const messages = {
  en: 'Good things take their own sweet time.',
  es: 'Las cosas buenas llegan a su debido tiempo.',
  fr: 'Les belles choses prennent leur temps.',
  de: 'Gute Dinge brauchen ihre Zeit.',
  hi: 'अच्छी चीज़ें अपना समय लेती हैं।',
} as const;

/** Native accessible dialog, with the same physical unrolling leaf as before. */
export function installBottleNote(dialog: HTMLDialogElement, onSound?: (type: 'paperOpen' | 'paperClose') => void) {
  const message = dialog.querySelector<HTMLElement>('#bottle-message')!;
  const leaf = createPalmLeafScroll(dialog.querySelector<HTMLCanvasElement>('.leaf-scroll-canvas')!);
  if (leaf) dialog.dataset.scroll = 'ready';
  let language: keyof typeof messages = 'en';
  const lookup = new AbortController();
  void visitorLanguage(lookup.signal).then(code => {
    if (!lookup.signal.aborted && Object.hasOwn(messages, code)) language = code as keyof typeof messages;
  });
  let closing = false;
  let destroyed = false;
  function open() {
    if (destroyed || dialog.open) return;
    message.textContent = messages[language];
    message.lang = language;
    dialog.showModal();
    leaf?.open(messages[language], language);
    onSound?.('paperOpen');
  }
  function close() {
    if (!dialog.open || closing) return;
    closing = true;
    onSound?.('paperClose');
    const done = () => { dialog.close(); closing = false; };
    if (leaf) leaf.close(done); else done();
  }
  function requestClose(event: Event) { event.preventDefault(); close(); }
  dialog.addEventListener('cancel', requestClose);
  dialog.addEventListener('submit', requestClose);
  return {
    open, close,
    destroy() {
      destroyed = true;
      lookup.abort();
      dialog.removeEventListener('cancel', requestClose);
      dialog.removeEventListener('submit', requestClose);
      leaf?.destroy();
    },
  };
}

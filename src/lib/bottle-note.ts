import { currentLanguage, onLanguageChange, translate } from './site-language';
import { createPalmLeafScroll } from './palm-leaf-scroll';

/** Native accessible dialog, with the same physical unrolling leaf as before. */
export function installBottleNote(dialog: HTMLDialogElement, onSound?: (type: 'paperOpen' | 'paperClose') => void) {
  const message = dialog.querySelector<HTMLElement>('#bottle-message')!;
  const leaf = createPalmLeafScroll(dialog.querySelector<HTMLCanvasElement>('.leaf-scroll-canvas')!);
  if (leaf) dialog.dataset.scroll = 'ready';
  let closing = false;
  let destroyed = false;
  function renderMessage() {
    if (!dialog.open || closing) return;
    const text = translate('Good things take their own sweet time.');
    message.textContent = text;
    message.lang = currentLanguage();
    leaf?.open(text, message.lang);
  }
  const unsubscribe = onLanguageChange(renderMessage);
  function open() {
    if (destroyed || dialog.open) return;
    dialog.showModal();
    renderMessage();
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
      unsubscribe();
      dialog.removeEventListener('cancel', requestClose);
      dialog.removeEventListener('submit', requestClose);
      leaf?.destroy();
    },
  };
}

/** DOM controls own their keys; canvas/body retain game shortcuts. */
export function acceptsGameShortcut(target:EventTarget|null){return !(target instanceof Element&&target.closest('input,select,textarea,button,summary,[contenteditable="true"],[role="slider"]'));}

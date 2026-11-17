// A tiny event channel so dialogs can say "data changed" without knowing
// which screen is open. main.js listens and redraws the current screen.

const channel = new EventTarget();

export const notifyDataChanged = () => channel.dispatchEvent(new Event("datachanged"));
export const onDataChanged = (listener) => channel.addEventListener("datachanged", listener);

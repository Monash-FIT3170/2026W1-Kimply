export function submitOnEnter(submit, { when = () => true } = {}) {
  return (event) => {
    if (event.key !== 'Enter') return;
    if (!when(event)) return;
    event.preventDefault();
    submit();
  };
}

export function removeOnBackspace(remove) {
  return (event) => {
    if (event.key !== 'Backspace') return;
    event.preventDefault();
    remove();
  };
}

export function combineKeyHandlers(...handlers) {
  return (event) => {
    for (const handler of handlers) {
      handler(event);
      if (event.defaultPrevented) return;
    }
  };
}

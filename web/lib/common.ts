// Gemensamma småsaker som flera modeller behöver utan att importera varandra.

/** Dagens datum i exemplet. Ligger som konstant så att kontroller går att testa. */
export const today = '2026-09-05';

export const uid = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16),
  ).join('-');

export const clock = () =>
  new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

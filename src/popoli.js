// The seven popoli with their Italian article ("Popolo dell’Aria", "Popolo del Mare"…).
export const POPOLI = [
  { id: 'aria', name: 'Aria', article: 'dell’' },
  { id: 'foresta', name: 'Foresta', article: 'della' },
  { id: 'luce', name: 'Luce', article: 'della' },
  { id: 'mare', name: 'Mare', article: 'del' },
  { id: 'tenebre', name: 'Tenebre', article: 'delle' },
  { id: 'terra', name: 'Terra', article: 'della' },
  { id: 'vulcano', name: 'Vulcano', article: 'del' },
];

export const popoloById = (id) => POPOLI.find((p) => p.id === id) ?? POPOLI[0];

import { useEffect, useState } from 'react';

const KEY = 'currentCongresId';
export const DEFAULT_CONGRES_ID = 'Fragilite_2025';

export function getCurrentCongresId() {
  try { return localStorage.getItem(KEY) || DEFAULT_CONGRES_ID; } catch { return DEFAULT_CONGRES_ID; }
}
export function setCurrentCongresId(v: string) {
  try {
    localStorage.setItem(KEY, v);
    window.dispatchEvent(new CustomEvent('congres:change', { detail: v }));
  } catch {}
}

export function useCongresId() {
  const [id, setId] = useState<string>(getCurrentCongresId());
  useEffect(() => {
    const on = () => setId(getCurrentCongresId());
    window.addEventListener('storage', on);
    window.addEventListener('congres:change', on as any);
    return () => {
      window.removeEventListener('storage', on);
      window.removeEventListener('congres:change', on as any);
    };
  }, []);
  return [id, setCurrentCongresId] as const;
}

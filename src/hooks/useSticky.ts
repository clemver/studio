import { useEffect, useState } from 'react';

const store = new Map<string, unknown>();

/** useState that survives page navigation for the session (filters, view options). */
export function useSticky<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : init));
  useEffect(() => { store.set(key, v); }, [key, v]);
  return [v, setV] as const;
}

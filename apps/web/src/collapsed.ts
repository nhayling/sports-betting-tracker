import { useCallback, useState } from 'react';

/**
 * Which bet cards are collapsed, remembered per device. Browser storage can be
 * unavailable (private mode), so every access is guarded and the app works without it.
 */
const KEY = 'sports-better:collapsed-coupons';

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function write(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Not persisted; the in-memory state still works for this visit.
  }
}

export function useCollapsed(id: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => read().has(id));
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const ids = read();
      if (was) ids.delete(id);
      else ids.add(id);
      write(ids);
      return !was;
    });
  }, [id]);
  return [collapsed, toggle];
}

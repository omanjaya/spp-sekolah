'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce a value by `delay` ms. Returns the debounced value that only
 * updates after the value has stayed stable for `delay` ms.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

'use client';

import { useEffect } from 'react';

export interface ShortcutOptions {
  /** Key to match (case-insensitive), e.g. "k", "Enter", "Escape". */
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** If true, prevent default browser behavior on match. Default: true. */
  preventDefault?: boolean;
  /** If false, attach but do not react. Default: true. */
  enabled?: boolean;
}

/**
 * Register a global keyboard shortcut on the window.
 * Stub for Sprint 0 — the command palette integration will consume this.
 */
export function useKeyboardShortcut(
  options: ShortcutOptions,
  handler: (event: KeyboardEvent) => void,
): void {
  const {
    key,
    meta = false,
    ctrl = false,
    shift = false,
    alt = false,
    preventDefault = true,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const keyMatches = event.key.toLowerCase() === key.toLowerCase();
      if (!keyMatches) return;
      if (meta && !event.metaKey) return;
      if (ctrl && !event.ctrlKey) return;
      if (shift && !event.shiftKey) return;
      if (alt && !event.altKey) return;

      if (preventDefault) event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, meta, ctrl, shift, alt, preventDefault, enabled, handler]);
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../utils/constants';

const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +z.toFixed(2)));

/**
 * Horizontal zoom for the roadmap chart.
 *
 * Provides:
 *  - `zoom` and setter helpers (`zoomIn`, `zoomOut`, `resetZoom`)
 *  - keyboard shortcuts (`+` / `=` / `-` / `_` / `0`) that respect text inputs
 *  - Ctrl/⌘ + wheel zoom on the returned `scrollContainerRef`, anchored to
 *    the cursor position so the point under the mouse stays put
 *
 * Caller attaches `scrollContainerRef` to the scrollable container that
 * wraps the SVG.
 */
export function useZoom(initial = 1) {
  const [zoom, setZoom] = useState(initial);
  const scrollContainerRef = useRef(null);

  const zoomIn  = useCallback(() => setZoom(z => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom(z => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // Keyboard shortcuts
  useEffect(() => {
    const isTextEntry = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };
    const onKey = (e) => {
      if (isTextEntry(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { zoomIn();  e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { zoomOut(); e.preventDefault(); }
      else if (e.key === '0') { resetZoom(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, resetZoom]);

  // Ctrl+wheel zoom centered on cursor
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(prev => {
        const next = clampZoom(prev * factor);
        if (next === prev) return prev;
        requestAnimationFrame(() => {
          if (!scrollContainerRef.current) return;
          const ratio = next / prev;
          scrollContainerRef.current.scrollLeft = cursorX * ratio - (e.clientX - rect.left);
        });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return { zoom, setZoom, zoomIn, zoomOut, resetZoom, scrollContainerRef };
}

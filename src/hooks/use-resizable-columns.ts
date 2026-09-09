'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseResizableColumnsOptions {
  storageKey?: string;
  defaultWidths: Record<string, number>;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizableColumns({
  storageKey = 'wacrm_contacts_col_widths',
  defaultWidths,
  minWidth = 80,
  maxWidth = 800,
}: UseResizableColumnsOptions) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return defaultWidths;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return { ...defaultWidths, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return defaultWidths;
  });

  const resizingRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const [isResizing, setIsResizing] = useState<string | null>(null);

  const startResize = useCallback(
    (colKey: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentWidth = widths[colKey] || defaultWidths[colKey] || 150;
      resizingRef.current = {
        colKey,
        startX: e.clientX,
        startWidth: currentWidth,
      };
      setIsResizing(colKey);
    },
    [widths, defaultWidths]
  );

  const resetWidth = useCallback(
    (colKey: string) => {
      setWidths((prev) => {
        const next = { ...prev, [colKey]: defaultWidths[colKey] || 150 };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [defaultWidths, storageKey]
  );

  const resetAllWidths = useCallback(() => {
    setWidths(defaultWidths);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [defaultWidths, storageKey]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const diff = e.clientX - startX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + diff));

      setWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    }

    function handleMouseUp() {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      setIsResizing(null);

      // Persist to localStorage
      setWidths((latest) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(latest));
        } catch {}
        return latest;
      });
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth, storageKey]);

  return {
    widths,
    isResizing,
    startResize,
    resetWidth,
    resetAllWidths,
    getWidth: (colKey: string, fallback: number = 150) =>
      widths[colKey] ?? defaultWidths[colKey] ?? fallback,
  };
}

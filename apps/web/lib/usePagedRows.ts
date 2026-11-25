"use client";

import { useEffect, useState } from "react";

/** Reveals the first page after a short async delay, then further pages on demand. */
export function usePagedRows<T>(items: T[], pageSize = 5) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setCount(Math.min(pageSize, items.length));
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [items, pageSize]);

  function loadMore() {
    setLoading(true);
    window.setTimeout(() => {
      setCount((current) => Math.min(current + pageSize, items.length));
      setLoading(false);
    }, 250);
  }

  return {
    rows: items.slice(0, count),
    loading,
    hasMore: count > 0 && count < items.length,
    loadMore,
  };
}

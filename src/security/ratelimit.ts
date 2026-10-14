// Limitation de débit en mémoire, par IP et par action (fenêtre glissante).
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) {
      const kept = v.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, 60_000).unref();
  return (key: string, now = Date.now()): boolean => {
    const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    return true;
  };
}

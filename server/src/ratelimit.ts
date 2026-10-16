/** Simple token-bucket limiter keyed by string. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  private capacity: number;
  private windowMs: number;

  constructor(capacity: number, windowMs: number) {
    this.capacity = capacity;
    this.windowMs = windowMs;
  }

  take(key: string, capacity = this.capacity, cost = 1): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: capacity, updated: now };
      this.buckets.set(key, b);
    }
    const refill = ((now - b.updated) / this.windowMs) * capacity;
    b.tokens = Math.min(capacity, b.tokens + refill);
    b.updated = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    if (this.buckets.size > 50_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [k, b] of this.buckets) if (now - b.updated > this.windowMs * 4) this.buckets.delete(k);
  }
}

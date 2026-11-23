export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly waitingQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error('maxConcurrent must be a positive integer');
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getPendingCount(): number {
    return this.waitingQueue.length;
  }

  private acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitingQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.waitingQueue.shift();
    if (next) next();
  }
}

export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chained = prev.then(() => current, () => current);
    this.tails.set(key, chained);

    await prev;
    try {
      return await fn();
    } finally {
      releaseCurrent();
      if (this.tails.get(key) === chained) {
        this.tails.delete(key);
      }
    }
  }
}

import { Rule } from './schemas.js';

export interface CacheConfig {
  maxSize: number; // Maximum number of items in the cache
  defaultTtl: number; // Default time-to-live in milliseconds
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number; // Current number of items
  evictions: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number; // When the entry was added/updated
  ttl: number; // Time-to-live for this specific entry
  metadata?: { checksum?: string };
}

export class IntelligentCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private lru: string[] = []; // Stores keys in order of last access (LRU at the beginning)
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private config: CacheConfig) {
    if (this.config.defaultTtl > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Sets an item in the cache.
   * @param key The cache key.
   * @param data The data to cache.
   * @param ttl Optional time-to-live for this entry in milliseconds. Defaults to config.defaultTtl.
   * @param metadata Optional metadata, e.g., checksum.
   */
  set(key: string, data: T, ttl?: number, metadata?: { checksum?: string }): void {
    const entryTtl = ttl !== undefined ? ttl : this.config.defaultTtl;
    const newEntry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: entryTtl,
      metadata,
    };

    if (this.cache.has(key)) {
      // Update existing entry
      this.cache.set(key, newEntry);
      // Move to end of LRU (most recently used)
      this.moveToFrontOfLru(key);
    } else {
      // Add new entry
      this.ensureCapacity(1); // Ensure there's space for one new item
      this.cache.set(key, newEntry);
      this.lru.push(key);
      this.stats.size++;
    }
  }

  /**
   * Retrieves an item from the cache.
   * @param key The cache key.
   * @returns The cached data or null if not found or expired.
   */
  get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.invalidate(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    // Move to end of LRU (most recently used)
    this.moveToFrontOfLru(key);
    return entry;
  }

  /**
   * Invalidates a specific cache entry.
   * @param key The cache key to invalidate.
   * @returns True if the entry was found and invalidated, false otherwise.
   */
  invalidate(key: string): boolean {
    if (this.cache.delete(key)) {
      this.lru = this.lru.filter(k => k !== key);
      this.stats.size--;
      return true;
    }
    return false;
  }

  /**
   * Invalidates cache entries matching a regex pattern.
   * @param pattern The regex pattern to match keys against.
   * @returns The number of invalidated entries.
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidatedCount = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.invalidate(key);
        invalidatedCount++;
      }
    }
    return invalidatedCount;
  }

  /**
   * Gets current cache statistics.
   * @returns CacheStats object.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Ensures there is capacity for new items, evicting LRU items if necessary.
   * @param newEntrySize The number of new entries to make space for.
   */
  private ensureCapacity(newEntrySize: number): void {
    while (this.stats.size + newEntrySize > this.config.maxSize) {
      this.evictLRU(1); // Evict one LRU item at a time
    }
  }

  /**
   * Evicts the least recently used items from the cache.
   * @param count The number of items to evict.
   */
  private evictLRU(count: number): void {
    for (let i = 0; i < count && this.lru.length > 0; i++) {
      const keyToEvict = this.lru.shift(); // Remove from the beginning (LRU)
      if (keyToEvict) {
        this.cache.delete(keyToEvict);
        this.stats.size--;
        this.stats.evictions++;
      }
    }
  }

  /**
   * Moves a key to the front (most recently used) of the LRU list.
   * @param key The key to move.
   */
  private moveToFrontOfLru(key: string): void {
    this.lru = this.lru.filter(k => k !== key);
    this.lru.push(key);
  }

  /**
   * Checks if a cache entry has expired.
   * @param entry The cache entry.
   * @returns True if expired, false otherwise.
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return entry.ttl > 0 && (Date.now() - entry.timestamp > entry.ttl);
  }

  /**
   * Starts a background timer for periodic cache cleanup.
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.defaultTtl / 2); // Run cleanup periodically
  }

  /**
   * Performs cleanup of expired items.
   */
  private performCleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.invalidate(key);
      }
    }
  }

  /**
   * Clears the entire cache and resets stats.
   */
  clear(): void {
    this.cache.clear();
    this.lru = [];
    this.stats = { hits: 0, misses: 0, size: 0, evictions: 0 };
  }

  /**
   * Stops the background cleanup timer.
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Specific cache implementations for rules and index
export class RuleCache extends IntelligentCache<Rule[]> {
  constructor(config: CacheConfig = { maxSize: 100, defaultTtl: 60 * 60 * 1000 }) { // 100 rule sets, 1 hour TTL
    super(config);
  }
}

export interface RulesetIndexEntry {
  name: string;
  description: string;
  lastUpdated: string; // ISO date string
  checksum: string;
}

export class IndexCache extends IntelligentCache<RulesetIndexEntry[]> {
  constructor(config: CacheConfig = { maxSize: 1, defaultTtl: 5 * 60 * 1000 }) { // Only one index, 5 minutes TTL
    super(config);
  }
}

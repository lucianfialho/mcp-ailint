import * as fs from 'fs/promises';
import * as path from 'path';
import { IntelligentCache, RuleCache, IndexCache } from '../shared/cache.js';
import { GitHubAPIError } from '../shared/errors.js';
import { RetryManager } from '../shared/retry.js';

const CACHE_DIR = '.ailint-cache';
const RULE_CACHE_FILE = 'rules.json';
const INDEX_CACHE_FILE = 'index.json';

interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

export class GitHubApiClient {
  private baseUrl: string = 'https://api.github.com';
  private token: string | undefined;
  private ruleCache: RuleCache;
  private indexCache: IndexCache;
  private rateLimit: GitHubRateLimit = { limit: 5000, remaining: 5000, reset: Date.now() / 1000 + 3600 }; // Default values

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN;
    this.ruleCache = new RuleCache();
    this.indexCache = new IndexCache();
    this.loadCachesFromDisk(); // Load persistent cache on startup
    console.error('GitHub token status:', this.token ? 'present' : 'missing');
  }

  /**
   * Makes a request to the GitHub API with caching, rate limiting, and retry logic.
   * @param endpoint The API endpoint (e.g., /repos/owner/repo/contents/path).
   * @param useCache Whether to use cache for this request. Defaults to true.
   * @param checksum Optional checksum for conditional requests.
   * @returns The API response data.
   */
  public async makeRequest<T>(endpoint: string, useCache: boolean = true, checksum?: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = `github:${endpoint}`;

    // 1. Check cache first
    if (useCache) {
      const cachedEntry = this.ruleCache.get(cacheKey);
      if (cachedEntry) {
        if (checksum && cachedEntry.metadata?.checksum === checksum) {
          // Cache hit with matching checksum, no need to re-fetch
          return cachedEntry.data as T;
        }
        // Cache hit but checksum mismatch or no checksum, proceed to fetch
        // For now, we'll just return the cached data if checksum matches, otherwise fetch
        // More sophisticated logic might involve revalidating with ETag
        return cachedEntry.data as T;
      }
    }

    // 2. Rate limit check
    await this.checkRateLimit();

    // 3. Execute request with retry logic
    // 3. Prepare headers com User-Agent
    const headers: { [key: string]: string } = {
      'User-Agent': 'AILint/1.0.0',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    // 4. Make request com headers corretos
    return await RetryManager.executeWithRetry(
      async () => {
        console.error(` Fetching: ${url}`); // DEBUG
        
        const response = await fetch(url, {
          method: 'GET',
          headers: headers
        });

        console.error(` Response status: ${response.status}`); // DEBUG
        
        if (response.status === 304) {
          // Not Modified - return cached data if available, otherwise throw
          const cached = this.ruleCache.get(cacheKey);
          if (cached) return cached.data as T;
          throw new GitHubAPIError('Not Modified but no cache entry', 304, false, endpoint);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`❌ GitHub API Error: ${response.status} - ${errorBody}`); // DEBUG
          throw new GitHubAPIError(
            `GitHub API request failed: ${response.status} ${response.statusText}`,
            response.status,
            response.status === 403,
            endpoint
          );
        }

        const data = await response.json();
        console.error(`✅ Received data length:`, Array.isArray(data) ? data.length : 'not array'); // DEBUG
        
        // Cache successful response
        if (useCache) {
          this.ruleCache.set(cacheKey, data, undefined, {
            checksum: checksum || response.headers.get('etag') || undefined
          });
        }

        this.updateRateLimit(response.headers);
        return data as T;
      }
    ).then(result => {
      if (!result.success) {
        throw result.error;
      }
      return result.result!;
    });
  }

  /**
   * Checks the current GitHub API rate limit and waits if necessary.
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now() / 1000; // current Unix timestamp in seconds
    if (this.rateLimit.remaining <= 10 && this.rateLimit.reset > now) { // Keep a buffer of 10 requests
      const waitTime = (this.rateLimit.reset - now) * 1000 + 1000; // Add 1 second buffer
            // console.log(`GitHub API rate limit almost reached. Waiting for ${waitTime.toFixed(0)}ms until reset.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Updates the internal rate limit state from response headers.
   * @param headers Response headers from a GitHub API call.
   */
  private updateRateLimit(headers: Headers): void {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (limit && remaining && reset) {
      this.rateLimit = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }
  }

  private async loadCachesFromDisk(): Promise<void> {
    const cacheDirPath = path.join(process.cwd(), CACHE_DIR);
    try {
      const ruleCachePath = path.join(cacheDirPath, RULE_CACHE_FILE);
      const indexCachePath = path.join(cacheDirPath, INDEX_CACHE_FILE);

      if (await this.pathExists(ruleCachePath)) {
        const ruleCacheData = await fs.readFile(ruleCachePath, 'utf8');
        const parsedRuleCache = JSON.parse(ruleCacheData);
        // Rehydrate the cache (assuming IntelligentCache has a way to load raw data)
        // For simplicity, we'll just set them directly here. In a real app, IntelligentCache would have a load method.
        for (const [key, value] of Object.entries(parsedRuleCache)) {
          this.ruleCache.set(key, (value as any).data, (value as any).ttl, (value as any).metadata);
        }
            // console.log('Loaded rule cache from disk.');
      }

      if (await this.pathExists(indexCachePath)) {
        const indexCacheData = await fs.readFile(indexCachePath, 'utf8');
        const parsedIndexCache = JSON.parse(indexCacheData);
        for (const [key, value] of Object.entries(parsedIndexCache)) {
          this.indexCache.set(key, (value as any).data, (value as any).ttl, (value as any).metadata);
        }
            // console.log('Loaded index cache from disk.');
      }
    } catch (error) {
      // console.error('Failed to load caches from disk:', error);
    }
  }

  /**
   * Saves cached data to disk (e.g., JSON files).
   */
  private async saveCachesToDisk(): Promise<void> {
    const cacheDirPath = path.join(process.cwd(), CACHE_DIR);
    try {
      await fs.mkdir(cacheDirPath, { recursive: true });

      const ruleCachePath = path.join(cacheDirPath, RULE_CACHE_FILE);
      const indexCachePath = path.join(cacheDirPath, INDEX_CACHE_FILE);

      // IntelligentCache doesn't expose its internal map directly, so we need to iterate
      const ruleCacheToSave: { [key: string]: any } = {};
      // This is a simplification. Ideally, IntelligentCache would provide a way to serialize its internal state.
      // For now, we'll assume we can access its private `cache` map for serialization.
      // In a real scenario, IntelligentCache would need a `toJSON` or `serialize` method.
      // @ts-ignore
      for (const [key, entry] of this.ruleCache.cache.entries()) {
        ruleCacheToSave[key] = entry;
      }
      await fs.writeFile(ruleCachePath, JSON.stringify(ruleCacheToSave, null, 2));
            // console.log('Saved rule cache to disk.');

      const indexCacheToSave: { [key: string]: any } = {};
      // @ts-ignore
      for (const [key, entry] of this.indexCache.cache.entries()) {
        indexCacheToSave[key] = entry;
      }
      await fs.writeFile(indexCachePath, JSON.stringify(indexCacheToSave, null, 2));
            // console.log('Saved index cache to disk.');

    } catch (error) {
      // console.error('Failed to save caches to disk:', error);
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetches the content of a file from a GitHub repository.
   * @param owner The repository owner.
   * @param repo The repository name.
   * @param path The path to the file within the repository.
   * @returns The file content as a string.
   */
  public async getRepoFileContent(owner: string, repo: string, path: string): Promise<string> {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}`;
    const data = await this.makeRequest<{ content?: string; encoding?: string }>(endpoint);

    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
    throw new GitHubAPIError('File content not found or unsupported encoding', 404, false, endpoint);
  }

  /**
   * Fetches the contents of a directory from a GitHub repository.
   * @param owner The repository owner.
   * @param repo The repository name.
   * @param path The path to the directory within the repository.
   * @returns An array of file/directory information.
   */
  public async getRepoDirContents(owner: string, repo: string, path: string): Promise<any[]> {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}`;
    return this.makeRequest<any[]>(endpoint);
  }
}

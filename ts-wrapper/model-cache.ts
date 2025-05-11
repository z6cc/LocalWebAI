// Database name and version
const DB_NAME = 'llama-wasm-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';

/**
 * ModelCache class - handles caching models in IndexedDB
 */
export class ModelCache {
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDatabase();
  }

  /**
   * Initialize the IndexedDB database for model caching
   */
  private async initDatabase(): Promise<void> {
    return new Promise((resolve) => { // Removed reject as we handle errors gracefully
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB is not available. Caching will be disabled.');
        resolve();
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open model cache database");
        resolve(); // Don't reject, we can still function without the cache
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'modelId' });
        }
      };
    });
  }

  /**
   * Get a model from the cache if available
   * @param modelId Unique identifier for the model
   */
  public async getModelFromCache(modelId: string): Promise<ArrayBuffer | null> {
    const currentDb = this.db;
    if (!currentDb) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const transaction = currentDb.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(modelId);

        request.onsuccess = () => {
          if (request.result && request.result.data) {
            resolve(request.result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error("Error fetching model from cache");
          resolve(null);
        };
      } catch (error) {
        console.error("Error accessing cache:", error);
        resolve(null);
      }
    });
  }

  /**
   * Cache a model in IndexedDB
   * @param modelId Unique identifier for the model
   * @param modelData The model data as ArrayBuffer
   */
  public async cacheModel(modelId: string, modelData: ArrayBuffer): Promise<void> {
    const currentDb = this.db;
    if (!currentDb) {
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.put({
          modelId,
          data: modelData,
          timestamp: Date.now()
        });

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("Error caching model");
          resolve(); // Resolve even on error to not break the flow
        };
      } catch (error) {
        console.error("Error writing to cache:", error);
        resolve(); // Resolve even on error
      }
    });
  }

  /**
   * Checks if a model is already cached.
   * @param modelId Unique identifier for the model.
   * @returns Promise<boolean> True if the model is cached, false otherwise.
   */
  public async isModelCached(modelId: string): Promise<boolean> {
    const cachedModel = await this.getModelFromCache(modelId);
    return !!cachedModel;
  }

  /**
   * Clears the entire model cache.
   * @returns Promise<void>
   */
  public async clearCache(): Promise<void> {
    const currentDb = this.db;
    if (!currentDb) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };
        request.onerror = (event) => {
          console.error("Error clearing cache");
          reject((event.target as IDBRequest)?.error || new Error("Unknown error clearing cache"));
        };
      } catch (error) {
        console.error("Error initiating cache clearing:", error);
        reject(error);
      }
    });
  }
} 
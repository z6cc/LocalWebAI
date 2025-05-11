// Database name and version
const DB_NAME = 'llama-wasm-models';
const DB_VERSION = 2; // Incremented version due to schema changes
const METADATA_STORE_NAME = 'modelMetadata';
const CHUNK_STORE_NAME = 'modelChunks';

const DEFAULT_CHUNK_SIZE_BYTES = 16 * 1024 * 1024; // 16MB chunks
const DEFAULT_MAX_CACHE_SIZE_BYTES = 512 * 1024 * 1024; // 512MB max cache size

interface ModelMetadata {
  modelId: string;
  totalSize: number;
  chunkCount: number;
  chunkSize: number;
  createdAt: number;
  lastAccessed: number;
  // Optional: User-provided filename or other info
  fileName?: string; 
  contentType?: string;
}

interface ModelChunk {
  modelId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

/**
 * ModelCache class - handles caching models in IndexedDB with chunking and LRU eviction.
 */
export class ModelCache {
  private db: IDBDatabase | null = null;
  private dbReadyPromise: Promise<void>;
  private readonly chunkSize: number;
  private readonly maxCacheSize: number;

  constructor(chunkSizeInBytes?: number, maxCacheSizeInBytes?: number) {
    this.chunkSize = chunkSizeInBytes || DEFAULT_CHUNK_SIZE_BYTES;
    this.maxCacheSize = maxCacheSizeInBytes || DEFAULT_MAX_CACHE_SIZE_BYTES;
    this.dbReadyPromise = this.initDatabase();
  }

  /**
   * Initialize the IndexedDB database for model caching
   */
  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB is not available. Caching will be disabled.');
        // Resolve, as we don't want to break the app, just disable caching.
        // Operations will check for this.db and handle it.
        resolve(); 
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open model cache database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.db = request.result;
        const currentTransaction = (event.target as IDBOpenDBRequest).transaction;
        if (!currentTransaction) {
            console.error("Upgrade transaction is null. Cannot proceed with DB schema upgrade.");
            if (event.oldVersion > 0) { // Only reject if it's a real upgrade attempt
                // currentTransaction is null here, so can't call abort.
                // The reject below will handle signalling the failure.
                reject(new Error("Upgrade transaction was null during onupgradeneeded"));
            }
            return;
        }

        // If upgrading from a version with the old 'models' store, delete it.
        // The old store name was 'models' according to the original file's STORE_NAME constant.
        if (event.oldVersion < 2 && this.db.objectStoreNames.contains('models')) {
          console.log("Upgrading database: Deleting old 'models' store.");
          this.db.deleteObjectStore('models');
        }

        if (!this.db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          console.log("Upgrading database: Creating metadata store.");
          const metadataOS = this.db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'modelId' });
          metadataOS.createIndex('idx_lastAccessed', 'lastAccessed', { unique: false });
        }
        if (!this.db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
          console.log("Upgrading database: Creating chunks store.");
          // Using a compound key path for chunks ensures uniqueness and allows easy querying.
          this.db.createObjectStore(CHUNK_STORE_NAME, { keyPath: ['modelId', 'chunkIndex'] });
        }
      };
    });
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.dbReadyPromise;
    if (!this.db) {
      throw new Error('IndexedDB is not available or failed to initialize. Caching is disabled.');
    }
    return this.db;
  }

  /**
   * Get a model from the cache if available
   * @param modelId Unique identifier for the model
   */
  public async getModelFromCache(modelId: string): Promise<ArrayBuffer | null> {
    const db = await this.getDb();

    return new Promise(async (resolve, reject) => {
      try {
        const metadataTransaction = db.transaction(METADATA_STORE_NAME, 'readwrite'); // readwrite to update lastAccessed
        const metadataStore = metadataTransaction.objectStore(METADATA_STORE_NAME);
        const metadataRequest = metadataStore.get(modelId);

        metadataRequest.onsuccess = async () => {
          const metadata: ModelMetadata | undefined = metadataRequest.result;
          if (!metadata) {
            resolve(null);
            return;
          }

          // Update lastAccessed timestamp
          metadata.lastAccessed = Date.now();
          const updateMetadataRequest = metadataStore.put(metadata);
          
          updateMetadataRequest.onerror = () => {
            console.warn("Failed to update lastAccessed timestamp for model:", modelId, updateMetadataRequest.error);
            // Continue fetching the model even if timestamp update fails
          };

          // Fetch chunks
          const chunkTransaction = db.transaction(CHUNK_STORE_NAME, 'readonly');
          const chunkStore = chunkTransaction.objectStore(CHUNK_STORE_NAME);
          // Range to get all chunks for this modelId, ordered by chunkIndex (implicit by compound key)
          const chunkRange = IDBKeyRange.bound([modelId, 0], [modelId, Number.MAX_SAFE_INTEGER]);
          const getAllChunksRequest = chunkStore.getAll(chunkRange);

          getAllChunksRequest.onsuccess = () => {
            const chunks: ModelChunk[] = getAllChunksRequest.result;
            if (chunks.length !== metadata.chunkCount) {
              console.error(`Inconsistent chunk count for model ${modelId}. Expected ${metadata.chunkCount}, found ${chunks.length}. Invalidating this cache entry.`);
              // Clean up inconsistent entry
              this.deleteModel(modelId).catch(err => console.error("Error cleaning up inconsistent model:", err));
              resolve(null);
              return;
            }
            
            // Sort chunks by chunkIndex just in case getAll doesn't guarantee order perfectly with compound keys
            // although it generally should with IDBKeyRange on an ordered key.
            chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

            const reassembledBuffer = new ArrayBuffer(metadata.totalSize);
            const reassembledView = new Uint8Array(reassembledBuffer);
            let offset = 0;
            for (const chunk of chunks) {
              reassembledView.set(new Uint8Array(chunk.data), offset);
              offset += chunk.data.byteLength;
            }
            resolve(reassembledBuffer);
          };

          getAllChunksRequest.onerror = () => {
            console.error("Error fetching model chunks from cache for model:", modelId, getAllChunksRequest.error);
            reject(getAllChunksRequest.error);
          };
        };

        metadataRequest.onerror = () => {
          console.error("Error fetching model metadata from cache for model:", modelId, metadataRequest.error);
          reject(metadataRequest.error);
        };
      } catch (error) {
        console.error("Error accessing cache for getModelFromCache:", error);
        reject(error);
      }
    });
  }

  /**
   * Cache a model in IndexedDB
   * @param modelId Unique identifier for the model
   * @param modelData The model data as ArrayBuffer
   * @param modelFileName Optional: original filename for metadata
   * @param modelContentType Optional: original content type for metadata
   */
  public async cacheModel(
    modelId: string, 
    modelData: ArrayBuffer,
    modelFileName?: string,
    modelContentType?: string
  ): Promise<void> {
    const db = await this.getDb();

    return new Promise(async (resolve, reject) => {
      let transaction: IDBTransaction | null = null; // Keep a reference to abort if needed
      try {
        // First, delete any existing data for this modelId to ensure clean write
        await this.deleteModel(modelId, db); 
        
        const totalSize = modelData.byteLength;
        const chunkCount = Math.ceil(totalSize / this.chunkSize);
        const now = Date.now();

        const metadata: ModelMetadata = {
          modelId,
          totalSize,
          chunkCount,
          chunkSize: this.chunkSize,
          createdAt: now,
          lastAccessed: now,
          fileName: modelFileName,
          contentType: modelContentType,
        };

        transaction = db.transaction([METADATA_STORE_NAME, CHUNK_STORE_NAME], 'readwrite');
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        const putMetadataRequest = metadataStore.put(metadata);
        putMetadataRequest.onerror = () => {
            console.error("Error caching model metadata:", modelId, putMetadataRequest.error);
            if (transaction) transaction.abort(); 
            reject(putMetadataRequest.error);
            return;
        };
        
        let chunkPromises: Promise<void>[] = [];
        for (let i = 0; i < chunkCount; i++) {
          const start = i * this.chunkSize;
          const end = Math.min(start + this.chunkSize, totalSize);
          const chunkData = modelData.slice(start, end);

          const chunk: ModelChunk = {
            modelId,
            chunkIndex: i,
            data: chunkData,
          };
          
          chunkPromises.push(new Promise((resChunk, rejChunk) => {
            const putChunkRequest = chunkStore.put(chunk);
            putChunkRequest.onsuccess = () => resChunk();
            putChunkRequest.onerror = () => {
                console.error(`Error caching chunk ${i} for model ${modelId}:`, putChunkRequest.error);
                rejChunk(putChunkRequest.error);
            };
          }));
        }

        await Promise.all(chunkPromises).catch(err => {
            console.error("Error during chunk writing, aborting transaction for model:", modelId, err);
            if (transaction) transaction.abort();
            reject(err);
            throw err; // re-throw to prevent reaching transaction.oncomplete
        });

        transaction.oncomplete = async () => {
          await this.evictModelsIfNeeded(db);
          resolve();
        };
        transaction.onerror = () => {
          console.error("Error in cacheModel transaction:", modelId, transaction?.error);
          reject(transaction?.error);
        };

      } catch (error) {
        console.error("Error writing to cache for cacheModel:", error);
        if (transaction && transaction.error === null) { // If transaction not already aborted by an inner error
            try {
                transaction.abort();
            } catch (abortError) {
                console.error("Error aborting transaction in outer catch:", abortError);
            }
        }
        reject(error);
      }
    });
  }
  
  private async deleteModel(modelId: string, dbInstance?: IDBDatabase): Promise<void> {
    const db = dbInstance || await this.getDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE_NAME, CHUNK_STORE_NAME], 'readwrite');
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        // Delete metadata
        const deleteMetadataRequest = metadataStore.delete(modelId);
        deleteMetadataRequest.onerror = () => {
            console.warn(`Failed to delete metadata for ${modelId}:`, deleteMetadataRequest.error);
            // Don't hard fail, try to delete chunks anyway
        };

        // Delete all chunks for this modelId
        const chunkRange = IDBKeyRange.bound([modelId, 0], [modelId, Number.MAX_SAFE_INTEGER]);
        const cursorRequest = chunkStore.openCursor(chunkRange);
        let deleteChunkPromises: Promise<void>[] = [];

        cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                deleteChunkPromises.push(new Promise((res, rej) => {
                    const deleteRequest = cursor.delete();
                    deleteRequest.onsuccess = () => res();
                    deleteRequest.onerror = () => {
                        console.warn(`Failed to delete chunk for ${modelId}:`, deleteRequest.error);
                        rej(deleteRequest.error); // Propagate error if a chunk fails to delete
                    };
                }));
                cursor.continue();
            } else {
                // All chunks processed or no chunks found
                Promise.all(deleteChunkPromises).then(() => {
                    // Resolve after metadata attempt and all chunk deletions attempted/succeeded
                }).catch(err => {
                    // If any chunk deletion failed, this will be caught.
                    // Transaction might already be aborted by the erroring chunk deletion.
                    console.warn(`Some chunks for ${modelId} might not have been deleted:`, err);
                });
            }
        };
        cursorRequest.onerror = () => {
            console.error(`Error opening cursor to delete chunks for ${modelId}:`, cursorRequest.error);
            // Don't reject here if metadata was deleted, but log it.
        };
        
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            console.error(`Error in deleteModel transaction for ${modelId}:`, transaction.error);
            reject(transaction.error);
        };
    });
  }

  private async evictModelsIfNeeded(dbInstance?: IDBDatabase): Promise<void> {
    const db = dbInstance || await this.getDb();
    
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly'); // Readonly for now, eviction will use new transactions
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const getAllMetadataRequest = metadataStore.getAll();

        getAllMetadataRequest.onsuccess = async () => {
            const allMetadata: ModelMetadata[] = getAllMetadataRequest.result;
            let currentCacheSize = allMetadata.reduce((sum, meta) => sum + meta.totalSize, 0);

            if (currentCacheSize <= this.maxCacheSize) {
                resolve();
                return;
            }

            // If there is only one model in the cache, and it exceeds the maxCacheSize,
            // allow it to stay. The maxCacheSize is a target for when multiple models are present.
            if (allMetadata.length === 1 && currentCacheSize > this.maxCacheSize) {
                console.log(`Cache contains a single model of size ${currentCacheSize / (1024*1024)}MB which exceeds max cache size of ${this.maxCacheSize / (1024*1024)}MB. Allowing it to stay.`);
                resolve();
                return;
            }
            
            console.log(`Cache size ${currentCacheSize / (1024*1024)}MB exceeds max ${this.maxCacheSize / (1024*1024)}MB. Evicting models.`);

            // Sort by lastAccessed (oldest first) for LRU eviction
            allMetadata.sort((a, b) => a.lastAccessed - b.lastAccessed);

            for (const meta of allMetadata) {
                if (currentCacheSize <= this.maxCacheSize) {
                    break;
                }
                console.log(`Evicting model: ${meta.modelId}, size: ${meta.totalSize / (1024*1024)}MB, last accessed: ${new Date(meta.lastAccessed).toISOString()}`);
                try {
                    await this.deleteModel(meta.modelId, db); // Use the passed db instance
                    currentCacheSize -= meta.totalSize;
                } catch (error) {
                    console.error(`Error evicting model ${meta.modelId}:`, error);
                    // Continue to try to evict other models
                }
            }
            resolve();
        };
        getAllMetadataRequest.onerror = () => {
            console.error("Error fetching all metadata for eviction check:", getAllMetadataRequest.error);
            reject(getAllMetadataRequest.error);
        };
    });
  }

  /**
   * Checks if a model is already cached.
   * @param modelId Unique identifier for the model.
   * @returns Promise<boolean> True if the model is cached, false otherwise.
   */
  public async isModelCached(modelId: string): Promise<boolean> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly');
        const store = transaction.objectStore(METADATA_STORE_NAME);
        const request = store.get(modelId); // Using get() is more efficient than openCursor or getAll if just checking existence

        request.onsuccess = () => {
          resolve(!!request.result);
        };
        request.onerror = () => {
          console.error("Error checking if model is cached:", modelId, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error("Error accessing cache for isModelCached:", error);
        reject(error);
      }
    });
  }

  /**
   * Clears the entire model cache.
   * @returns Promise<void>
   */
  public async clearCache(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([METADATA_STORE_NAME, CHUNK_STORE_NAME], 'readwrite');
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        const clearMetadataRequest = metadataStore.clear();
        const clearChunksRequest = chunkStore.clear();
        
        let metadataCleared = false;
        let chunksCleared = false;

        clearMetadataRequest.onsuccess = () => {
            metadataCleared = true;
            if (chunksCleared) resolve();
        };
        clearMetadataRequest.onerror = (event) => {
          console.error("Error clearing metadata store:", (event.target as IDBRequest)?.error);
          // Don't reject immediately, try to clear other store.
        };

        clearChunksRequest.onsuccess = () => {
            chunksCleared = true;
            if (metadataCleared) resolve();
        };
        clearChunksRequest.onerror = (event) => {
          console.error("Error clearing chunks store:", (event.target as IDBRequest)?.error);
        };
        
        transaction.oncomplete = () => {
            if (metadataCleared && chunksCleared) {
                resolve();
            } else {
                // This case should ideally be covered by individual request errors,
                // but as a fallback if oncomplete fires before errors fully propagate rejection.
                reject(new Error("Cache clearing failed for one or more stores. Check console for details."));
            }
        };
        transaction.onerror = (event) => {
          console.error("Error in clearCache transaction:", (event.target as IDBTransaction)?.error);
          reject((event.target as IDBTransaction)?.error || new Error("Unknown error clearing cache"));
        };

      } catch (error) {
        console.error("Error initiating cache clearing:", error);
        reject(error);
      }
    });
  }
} 
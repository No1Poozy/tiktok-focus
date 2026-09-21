export const CURRENT_SCHEMA_VERSION = 1;

/** The browser binding unwraps chrome.storage.local's keyed response. */
export interface StorageArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface VersionedStorageValue<T> {
  readonly schemaVersion: number;
  readonly data: T;
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Storage schema version ${String(schemaVersion)} is not supported.`);
    this.name = 'UnsupportedSchemaVersionError';
  }
}

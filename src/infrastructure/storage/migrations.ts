import { CURRENT_SCHEMA_VERSION, UnsupportedSchemaVersionError } from './storage-types';

/**
 * A small migration seam: add explicit older-version cases when schema v2 exists.
 * Migrating must be pure; reads never silently rewrite stored user data.
 * Missing/unversioned/malformed records have no trusted payload.
 */
export function readCurrentSchemaData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) {
    return undefined;
  }
  const version = value.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return undefined;

  switch (version) {
    case CURRENT_SCHEMA_VERSION:
      return 'data' in value ? value.data : undefined;
    default:
      // In particular, an older extension must not overwrite a newer schema.
      throw new UnsupportedSchemaVersionError(version);
  }
}

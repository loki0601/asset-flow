const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

export function isSqliteBlob(blob: Buffer): boolean {
  return blob.length >= SQLITE_HEADER.length && blob.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

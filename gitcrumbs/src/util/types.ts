export type SnapshotRow = { id:number; created_at:string; branch:string; summary:string; restored_from_snapshot_id:number|null };
export type FileStateRow = { snapshot_id:number; path:string; status:'T'|'U'|'D'; blob_sha:string; size:number|null; mtime:number|null };

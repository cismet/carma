export interface Lock {
  id: number;
  userString: string;
  info: string | null;
}

export interface HeldLock extends Lock {
  history: Lock[];
}

export interface LockInfo {
  context: string;
  object: string;
  time: string;
  client?: string;
}

export interface LockTarget {
  type: string;
  id: number;
}

export interface ObjectLock extends Lock {
  objectId: number;
}

export interface LockAdapter {
  listForObject(target: LockTarget): Promise<Lock[]>;
  listForObjects(type: string, ids: number[]): Promise<ObjectLock[]>;
  listByUser(userString: string): Promise<Lock[]>;
  write(target: LockTarget, userString: string, info: string): Promise<number>;
  remove(lockId: number, options?: { keepalive?: boolean }): Promise<void>;
}

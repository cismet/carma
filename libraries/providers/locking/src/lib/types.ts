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

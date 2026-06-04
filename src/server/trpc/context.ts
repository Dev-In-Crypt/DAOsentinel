import type { Session } from 'next-auth';
import { db } from '../db';

export interface Context {
  db: typeof db;
  session: Session | null;
  headers: Headers;
}

export async function createContext({ headers }: { headers: Headers }): Promise<Context> {
  // NextAuth session is read lazily where needed; for now we expose the raw request
  // and let auth() be called by procedures that need it.
  // We avoid importing auth() here to prevent edge bundling pulls.
  let session: Session | null = null;
  try {
    const { auth } = await import('../auth');
    session = await auth();
  } catch {
    session = null;
  }
  return { db, session, headers };
}

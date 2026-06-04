import { NextResponse } from 'next/server';
import { runRebuildDelegatesJob } from '@/server/jobs/rebuild-delegates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // delegate rebuild walks all top voters, give it time

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runRebuildDelegatesJob();
  return NextResponse.json({ ok: true, result });
}

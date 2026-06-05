import { NextResponse } from 'next/server';
import { runPriceSyncJob } from '@/server/jobs/sync-prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runPriceSyncJob();
  return NextResponse.json({ ok: true, result });
}

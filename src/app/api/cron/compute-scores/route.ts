import { NextResponse } from 'next/server';
import { runScoreJob } from '@/server/jobs/compute-scores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runScoreJob();
  return NextResponse.json({ ok: true, result });
}

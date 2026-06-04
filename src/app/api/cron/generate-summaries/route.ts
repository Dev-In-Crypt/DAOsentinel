import { NextResponse } from 'next/server';
import { runSummaryJob } from '@/server/jobs/generate-summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runSummaryJob();
  return NextResponse.json({ ok: true, result });
}

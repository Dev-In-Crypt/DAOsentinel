import { NextResponse } from 'next/server';
import { runTallySyncJob } from '@/server/jobs/sync-tally';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) return unauthorized();

  const { searchParams } = new URL(req.url);
  const offset = Number(searchParams.get('offset') ?? '0') || 0;
  const limit = Number(searchParams.get('limit') ?? '10') || 10;

  try {
    const result = await runTallySyncJob({ offset, limit });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

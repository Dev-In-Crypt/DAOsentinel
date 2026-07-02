'use client';
import { useEffect, useRef, useState } from 'react';
import type { WhaleCardData } from '@/server/landing-data';
import { timeAgo } from '@/lib/utils';

interface WhaleCard {
  key: number;
  wallet: string;
  votes: string;
  dao: string;
  prop: string;
  pct: number;
  born: number;
  leaving?: boolean;
}

function shorten(addr: string): string {
  if (!addr || addr.includes('…')) return addr;
  if (addr.includes('.')) return addr;
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function WhaleFeed({ initial = [] }: { initial?: WhaleCardData[] }) {
  const uid = useRef(0);
  const [cards, setCards] = useState<WhaleCard[]>(() =>
    initial.slice(0, 3).map((w) => ({
      key: uid.current++,
      wallet: shorten(w.voter),
      votes: w.vp ? formatVp(w.vp) : '—',
      dao: w.dao,
      prop: w.prop,
      pct: Math.round(w.vpPct),
      born: new Date(w.createdAt).getTime(),
    })),
  );

  // Live SSE — promote real whale_vote alerts into the feed.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/alerts/stream');
      es.addEventListener('alert', (e) => {
        try {
          const a = JSON.parse((e as MessageEvent).data) as {
            type?: string;
            data?: { voter?: string; vp?: number; vpPct?: number; proposalTitle?: string };
            daoName?: string;
          };
          if (a.type !== 'whale_vote' || !a.data) return;
          pushCard({
            wallet: shorten(a.data.voter ?? ''),
            votes: a.data.vp ? formatVp(a.data.vp) : '—',
            dao: a.daoName ?? '—',
            prop: a.data.proposalTitle ?? '',
            pct: Math.round(a.data.vpPct ?? 0),
          });
        } catch {
          // ignore bad payload
        }
      });
    } catch {
      // SSE not available
    }
    return () => es?.close();
  }, []);

  // re-render every second so "Xs ago" ticks
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  function pushCard(base: Omit<WhaleCard, 'key' | 'born' | 'leaving'>) {
    setCards((prev) => {
      const card: WhaleCard = { ...base, key: uid.current++, born: Date.now(), leaving: false };
      const next = [card, ...prev];
      if (next.length > 3) {
        const victim = next[next.length - 1];
        setTimeout(
          () =>
            setCards((p) => p.map((c) => (c.key === victim.key ? { ...c, leaving: true } : c))),
          0,
        );
        setTimeout(() => setCards((p) => p.filter((c) => c.key !== victim.key)), 520);
      }
      return next;
    });
  }

  return (
    <div className="whale-feed">
      <div className="whale-feed-head">
        <span className="dot" /> Whale Watch · Live
      </div>
      {cards.length === 0 ? (
        <div className="whale-card" style={{ opacity: 0.75 }}>
          <div className="wc-body" style={{ fontSize: 13 }}>
            Monitoring for whale votes — none in the recent window.
          </div>
        </div>
      ) : (
        cards.map((c) => <WhaleCardView key={c.key} card={c} />)
      )}
    </div>
  );
}

function WhaleCardView({ card }: { card: WhaleCard }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 40);
    return () => clearTimeout(t);
  }, []);
  const cls =
    'whale-card' + (card.leaving ? ' leaving' : entering ? ' enter' : '');
  return (
    <div className={cls}>
      <div className="wc-top">
        <div className="wc-icon">🐋</div>
        <span className="wc-tag">Whale Vote</span>
        <span className="wc-time">{timeAgo(card.born)}</span>
      </div>
      <div className="wc-body">
        <b>{card.wallet}</b> cast <b>{card.votes}</b> votes on{' '}
        <span className="wc-dao">{card.prop || card.dao}</span>
      </div>
      <div className="wc-foot">
        <div className="wc-bar">
          <i style={{ width: Math.min(100, card.pct) + '%' }} />
        </div>
        <span className="wc-pct">{card.pct}% of quorum</span>
      </div>
    </div>
  );
}

function formatVp(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toFixed(0);
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { WhaleFeed } from './WhaleFeed';
import { GovPanel } from './GovPanel';
import { OrbitalCore } from './OrbitalCore';
import { Planet, type OrbitalDao } from './Planet';

interface HeroProps {
  daos: OrbitalDao[];
  aggregateScore: number;
  scoreTrend: number;
  stats: {
    treasuryUsd: number;
    proposalsTracked: number;
    whaleAlerts24h: number;
    networkHealth: number;
  };
  monitoredCount: number;
}

const RINGS = {
  2: { name: 'Voter Turnout', val: '', cls: 'cyan' },
  3: { name: 'Decentralization', val: '', cls: 'indigo' },
  4: { name: 'Transparency', val: '', cls: 'amber' },
} as const;

const RING_GEO: Record<2 | 3 | 4, { d: string; dur: string }> = {
  2: { d: '52%', dur: '58s' },
  3: { d: '72%', dur: '74s' },
  4: { d: '92%', dur: '92s' },
};

export function OrbitalHero({
  daos,
  aggregateScore,
  scoreTrend,
  stats,
  monitoredCount,
}: HeroProps) {
  const [selected, setSelected] = useState<OrbitalDao | null>(null);

  // Distribute DAOs across 3 rings deterministically
  const placedDaos = useMemo(() => {
    const byRing: Record<2 | 3 | 4, OrbitalDao[]> = { 2: [], 3: [], 4: [] };
    daos.forEach((d, i) => {
      const ring = ((i % 3) + 2) as 2 | 3 | 4;
      byRing[ring].push(d);
    });
    return Object.entries(byRing).flatMap(([ring, list]) =>
      list.map((d, i) => ({
        ...d,
        ring: Number(ring) as 2 | 3 | 4,
        delay: -(i * (Number(ring) * 11)),
      })),
    );
  }, [daos]);

  const ringValues = useMemo(() => {
    // Aggregate metrics from breakdown to fill the ring legend.
    const avg = (key: string) =>
      daos.reduce((s, d) => s + (d.breakdown?.[key] ?? 0), 0) / Math.max(daos.length, 1);
    return {
      2: avg('participation').toFixed(0) + '%',
      3: avg('powerDistribution').toFixed(0) + ' / 100',
      4: avg('manipulationResistance').toFixed(0) + ' / 100',
    };
  }, [daos]);

  return (
    <header className="hero">
      <WhaleFeed />

      <div className="hero-intro">
        <span className="pill">
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'hsl(var(--mint))',
              boxShadow: '0 0 8px hsl(var(--mint))',
            }}
          />
          Live · {monitoredCount} DAOs monitored
        </span>
        <h1>
          Mission control for
          <br />
          <span className="grad-text">on-chain democracy</span>
        </h1>
        <p>
          DAO Sentinel tracks voter turnout, power concentration, and whale activity across the DAO
          universe — so governance capture never slips by unseen.
        </p>
      </div>

      <div className="orbital-wrap">
        <div className="ring-legend">
          {([2, 3, 4] as const).map((r) => {
            const cls = RINGS[r].cls;
            const c =
              cls === 'cyan'
                ? 'hsl(var(--cyan))'
                : cls === 'indigo'
                  ? 'hsl(var(--indigo-bright))'
                  : 'hsl(var(--amber))';
            return (
              <div className="rl-item" key={r} style={{ ['--rl-c' as never]: c }}>
                <span className="rl-glyph" />
                <span className="rl-text">
                  <span className="rl-name">{RINGS[r].name}</span>
                  <span className="rl-val">{ringValues[r]}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="orbital-stage">
          {([2, 3, 4] as const).map((r) => (
            <div
              className="ring"
              key={r}
              style={{ ['--d' as never]: RING_GEO[r].d }}
            />
          ))}
          {/* inner pulse + ticks */}
          <div className="ring dashed" style={{ ['--d' as never]: '30%' }}>
            {[0, -12, -24].map((dl, i) => (
              <div
                className="orbit"
                key={i}
                style={{
                  ['--d' as never]: '100%',
                  ['--dur' as never]: '34s',
                  ['--delay' as never]: dl + 's',
                }}
              >
                <div className="orbit-spin">
                  <div className="planet-holder">
                    <div className="tick" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <OrbitalCore score={aggregateScore} trend={scoreTrend} />

          {placedDaos.map((d) => {
            const geo = RING_GEO[d.ring as 2 | 3 | 4];
            return (
              <Planet
                key={d.id}
                dao={d}
                geo={geo}
                isActive={selected?.id === d.id}
                onOpen={setSelected}
              />
            );
          })}
        </div>
      </div>

      <div className="hero-stats">
        <div className="hs">
          <div className="hs-num cyan">${(stats.treasuryUsd / 1e9).toFixed(1)}B</div>
          <div className="hs-lab">Treasury monitored</div>
        </div>
        <div className="hs">
          <div className="hs-num">{stats.proposalsTracked.toLocaleString()}</div>
          <div className="hs-lab">Proposals tracked</div>
        </div>
        <div className="hs">
          <div className="hs-num">{stats.whaleAlerts24h}</div>
          <div className="hs-lab">Whale alerts · 24h</div>
        </div>
        <div className="hs">
          <div className="hs-num cyan">{stats.networkHealth.toFixed(1)}</div>
          <div className="hs-lab">Network health index</div>
        </div>
      </div>

      <div className="hero-fade" />
      <GovPanel dao={selected} onClose={() => setSelected(null)} />
    </header>
  );
}

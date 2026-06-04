/* GovWatch — Orbital hero, whale feed, governance detail panel */
const { useState, useEffect, useRef, useCallback } = React;

const RING_GEO = {
  2: { d: '52%', dur: '58s' },
  3: { d: '72%', dur: '74s' },
  4: { d: '92%', dur: '92s' },
};
const AGGREGATE_SCORE = 71.8;

/* animated number hook (timer-based so it runs even when backgrounded) */
function useCountUp(target, ms = 1700, deps = []) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const steps = 40;
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      const p = Math.min(1, i / steps);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p >= 1) clearInterval(iv);
    }, ms / steps);
    return () => clearInterval(iv);
  }, deps); // eslint-disable-line
  return v;
}

/* ---------- Planet ---------- */
function Planet({ dao, onOpen, isActive }) {
  const geo = RING_GEO[dao.ring];
  const style = {
    '--d': geo.d,
    '--dur': geo.dur,
    '--delay': dao.delay + 's',
    '--p-color': dao.color,
    '--p-glow': dao.glow,
  };
  return (
    <div className="orbit" style={style}>
      <div className="orbit-spin">
        <div className="planet-holder">
          <div className="planet-upright">
            <button
              className={'planet' + (isActive ? ' active' : '')}
              style={{ '--p-color': dao.color, '--p-glow': dao.glow }}
              onClick={() => onOpen(dao)}
              aria-label={dao.name + ' governance detail'}
            >
              {dao.mono}
            </button>
            <div className="planet-tip">
              <div className="pt-head">
                <span className="pt-name">{dao.name}</span>
                <span className={'pill ' + (dao.tag === 'good' ? '' : '')}
                  style={{ background: 'rgba(99,102,241,0.12)' }}>{dao.tagLabel}</span>
              </div>
              <div className="pt-row"><span>Democracy score</span><span style={{ color: '#fff' }}>{dao.score}</span></div>
              <div className="pt-row"><span>Voter turnout</span><span>{dao.turnout}%</span></div>
              <div className="pt-row"><span>Proposals · 30d</span><span>{dao.proposals30}</span></div>
              <div className="pt-row" style={{ marginTop: 7, color: 'var(--indigo-bright)' }}>
                <span style={{ color: 'var(--indigo-bright)' }}>Click to inspect →</span><span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Inner pulse ring with tick dots ---------- */
function PulseRing() {
  const ticks = [0, -12, -24];
  return (
    <div className="ring dashed" style={{ '--d': '30%' }}>
      {ticks.map((dl, i) => (
        <div className="orbit" key={i} style={{ '--d': '100%', '--dur': '34s', '--delay': dl + 's' }}>
          <div className="orbit-spin">
            <div className="planet-holder"><div className="tick" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- The Democracy Score core ---------- */
function Core() {
  const score = useCountUp(AGGREGATE_SCORE);
  const whole = Math.floor(score);
  const dec = Math.floor((score - whole) * 10);
  return (
    <div className="core">
      <div className="core-glow" />
      <div className="core-disc" />
      <div className="core-content">
        <div className="core-label">Democracy Score</div>
        <div className="core-score">{whole}<span className="dec">.{dec}</span></div>
        <div className="core-trend">▲ 2.4 <span style={{ color: 'var(--text-faint)' }}>· 30d</span></div>
        <div className="core-sub">NETWORK&nbsp;HEALTH&nbsp;INDEX</div>
      </div>
    </div>
  );
}

/* ---------- Whale feed ---------- */
function WhaleCard({ card, ago }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 40);
    return () => clearTimeout(t);
  }, []);
  const cls = 'whale-card' + (card.leaving ? ' leaving' : entering ? ' enter' : '');
  return (
    <div className={cls}>
      <div className="wc-top">
        <div className="wc-icon">🐋</div>
        <span className="wc-tag">Whale Vote</span>
        <span className="wc-time">{ago(card.born)}</span>
      </div>
      <div className="wc-body">
        <b>{card.wallet}</b> cast <b>{card.votes}</b> votes on <span className="wc-dao">{card.prop}</span>
      </div>
      <div className="wc-foot">
        <div className="wc-bar"><i style={{ width: card.pct + '%' }} /></div>
        <span className="wc-pct">{card.pct}% of quorum</span>
      </div>
    </div>
  );
}

function WhaleFeed() {
  const [cards, setCards] = useState([]);
  const idx = useRef(0);
  const uid = useRef(0);

  useEffect(() => {
    const W = window.GOVWATCH.WHALES;
    const spawn = () => {
      const base = W[idx.current % W.length];
      idx.current += 1;
      const card = { ...base, key: uid.current++, born: Date.now(), leaving: false };
      setCards((prev) => {
        const next = [card, ...prev];
        if (next.length > 3) {
          const victim = next[next.length - 1];
          setCards((p) => p.map((c) => (c.key === victim.key ? { ...c, leaving: true } : c)));
          setTimeout(() => setCards((p) => p.filter((c) => c.key !== victim.key)), 520);
        }
        return next;
      });
    };
    spawn();
    const t1 = setTimeout(spawn, 1400);
    const iv = setInterval(spawn, 4200);
    return () => { clearInterval(iv); clearTimeout(t1); };
  }, []);

  // re-render every second so "Xs ago" ticks
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(iv); }, []);

  const ago = (born) => {
    const s = Math.max(0, Math.round((Date.now() - born) / 1000));
    return s < 1 ? 'now' : s + 's ago';
  };

  return (
    <div className="whale-feed">
      <div className="whale-feed-head"><span className="dot" /> Whale Watch · Live</div>
      {cards.map((c) => <WhaleCard key={c.key} card={c} ago={ago} />)}
    </div>
  );
}

/* ---------- Governance detail panel ---------- */
function GovPanel({ dao, onClose }) {
  const open = !!dao;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = dao || {};
  const tagCls = d.tag === 'good' ? 'tag-good' : d.tag === 'watch' ? 'tag-watch' : 'tag-risk';
  const propColor = { pass: 'var(--mint)', live: 'var(--cyan)', fail: 'var(--rose)' };

  return (
    <React.Fragment>
      <div className={'gov-scrim' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'gov-panel' + (open ? ' open' : '')}
        style={{ '--p-color': d.color, '--p-glow': d.glow }}>
        {dao && (
          <React.Fragment>
            <div className="gov-head">
              <button className="gov-close" onClick={onClose} aria-label="Close">✕</button>
              <div className="gov-id">
                <div className="gp-token">{d.mono}</div>
                <div>
                  <div className="gp-name">{d.name}</div>
                  <div className="gp-meta">{d.holders} holders · {d.treasury} treasury</div>
                </div>
              </div>
              <div className="gov-score-big">
                <div className="gsb-n">{d.score}</div>
                <div className={'gsb-tag ' + tagCls}>{d.tagLabel}</div>
              </div>
            </div>
            <div className="gov-body">
              <div>
                <div className="gov-sec-title">Governance Metrics</div>
                <div className="gov-metrics">
                  {d.metrics.map((m, i) => (
                    <div className="gov-metric" key={i}>
                      <div className="gm-lab">{m.lab}</div>
                      <div className="gm-val">{m.val}<span className="u">{m.u}</span></div>
                      <div className="gm-bar"><i style={{ width: m.pct + '%', background: m.c }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="gov-sec-title">Recent Proposals</div>
                {d.props.map((p, i) => (
                  <div className="gov-prop" key={i}>
                    <div className="gpv" style={{ background: propColor[p.st] }} />
                    <div>
                      <div className="gp-t">{p.t}</div>
                      <div className="gp-s">
                        <span className={p.st === 'pass' ? 'pass' : p.st === 'fail' ? 'fail' : 'live'}>{p.s[0]}</span>
                        <span>{p.s[1]}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ justifyContent: 'center' }}>
                Open full governance report
              </button>
            </div>
          </React.Fragment>
        )}
      </aside>
    </React.Fragment>
  );
}

/* ---------- Hero ---------- */
function OrbitalHero() {
  const { DAOS, RINGS } = window.GOVWATCH;
  const [selected, setSelected] = useState(null);

  return (
    <header className="hero" data-screen-label="Hero">
      <WhaleFeed />
      <div className="hero-intro">
        <span className="pill">● Live · 142 DAOs monitored</span>
        <h1>Mission control for<br /><span className="grad">on-chain democracy</span></h1>
        <p>GovWatch tracks voter turnout, power concentration, and whale activity across the
          DAO universe — so governance capture never slips by unseen.</p>
      </div>

      <div className="orbital-wrap">
        <div className="ring-legend">
          {[2, 3, 4].map((r) => {
            const c = RINGS[r].cls === 'indigo' ? 'var(--indigo-bright)' : RINGS[r].cls === 'amber' ? 'var(--amber)' : 'var(--cyan)';
            return (
              <div className="rl-item" key={r} style={{ '--rl-c': c }}>
                <span className="rl-glyph" />
                <span className="rl-text">
                  <span className="rl-name">{RINGS[r].name}</span>
                  <span className="rl-val">{RINGS[r].val}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="orbital-stage">
          {/* metric rings */}
          {[2, 3, 4].map((r) => (
            <div className="ring" key={r} style={{ '--d': RING_GEO[r].d }} />
          ))}
          <PulseRing />
          <Core />
          {DAOS.map((dao) => (
            <Planet key={dao.id} dao={dao} onOpen={setSelected} isActive={selected && selected.id === dao.id} />
          ))}
        </div>
      </div>

      <div className="hero-stats">
        <div className="hs"><div className="hs-num cyan">$11.9B</div><div className="hs-lab">Treasury monitored</div></div>
        <div className="hs"><div className="hs-num">2,840</div><div className="hs-lab">Proposals tracked</div></div>
        <div className="hs"><div className="hs-num">316</div><div className="hs-lab">Whale alerts · 24h</div></div>
        <div className="hs"><div className="hs-num cyan">71.8</div><div className="hs-lab">Network health index</div></div>
      </div>

      <div className="hero-fade" />
      <GovPanel dao={selected} onClose={() => setSelected(null)} />
    </header>
  );
}

Object.assign(window, { OrbitalHero });

/* GovWatch — mock governance data (illustrative, not live) */
window.GOVWATCH = (function () {
  const DAOS = [
    {
      id: 'uni', name: 'Uniswap', mono: 'UNI', color: '#FF2D78', glow: 'rgba(255,45,120,0.6)',
      ring: 2, delay: -0, score: 81.4, tag: 'good', tagLabel: 'Healthy',
      turnout: 38.2, decentral: 71, proposals30: 9, treasury: '$3.1B', transparency: 88, holders: '341K',
      metrics: [
        { lab: 'Voter Turnout', val: '38.2', u: '%', pct: 38, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '71', u: '/100', pct: 71, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '9', u: '', pct: 60, c: 'var(--mint)' },
        { lab: 'Transparency', val: '88', u: '/100', pct: 88, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Deploy v4 hooks to Base mainnet', s: ['Passed', '64.1% quorum'], st: 'pass' },
        { t: 'Fee switch pilot — 0.05% pools', s: ['Live vote', 'ends in 2d'], st: 'live' },
        { t: 'Treasury diversification into RWAs', s: ['Failed', '41% turnout'], st: 'fail' },
      ],
    },
    {
      id: 'op', name: 'Optimism', mono: 'OP', color: '#FF4654', glow: 'rgba(255,70,84,0.6)',
      ring: 2, delay: -29, score: 74.0, tag: 'good', tagLabel: 'Healthy',
      turnout: 44.6, decentral: 66, proposals30: 14, treasury: '$840M', transparency: 79, holders: '212K',
      metrics: [
        { lab: 'Voter Turnout', val: '44.6', u: '%', pct: 45, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '66', u: '/100', pct: 66, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '14', u: '', pct: 80, c: 'var(--mint)' },
        { lab: 'Transparency', val: '79', u: '/100', pct: 79, c: 'var(--amber)' },
      ],
      props: [
        { t: 'RetroPGF Round 6 funding envelope', s: ['Passed', '71% turnout'], st: 'pass' },
        { t: 'Grant Council renewal — Season 7', s: ['Live vote', 'ends in 5d'], st: 'live' },
        { t: 'Sequencer revenue redistribution', s: ['Passed', '58% quorum'], st: 'pass' },
      ],
    },
    {
      id: 'ens', name: 'ENS', mono: 'ENS', color: '#5298FF', glow: 'rgba(82,152,255,0.6)',
      ring: 3, delay: -9, score: 69.2, tag: 'watch', tagLabel: 'Watch',
      turnout: 22.8, decentral: 58, proposals30: 5, treasury: '$1.0B', transparency: 84, holders: '94K',
      metrics: [
        { lab: 'Voter Turnout', val: '22.8', u: '%', pct: 23, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '58', u: '/100', pct: 58, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '5', u: '', pct: 35, c: 'var(--mint)' },
        { lab: 'Transparency', val: '84', u: '/100', pct: 84, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Endowment manager mandate extension', s: ['Passed', '52% quorum'], st: 'pass' },
        { t: 'Namechain L2 migration framework', s: ['Live vote', 'ends in 3d'], st: 'live' },
        { t: 'Reduce delegate quorum threshold', s: ['Failed', 'low turnout'], st: 'fail' },
      ],
    },
    {
      id: 'ldo', name: 'Lido', mono: 'LDO', color: '#54B6F0', glow: 'rgba(84,182,240,0.6)',
      ring: 3, delay: -46, score: 58.6, tag: 'risk', tagLabel: 'At Risk',
      turnout: 14.1, decentral: 41, proposals30: 6, treasury: '$410M', transparency: 72, holders: '47K',
      metrics: [
        { lab: 'Voter Turnout', val: '14.1', u: '%', pct: 14, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '41', u: '/100', pct: 41, c: 'var(--rose)' },
        { lab: 'Proposals · 30d', val: '6', u: '', pct: 40, c: 'var(--mint)' },
        { lab: 'Transparency', val: '72', u: '/100', pct: 72, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Dual governance v2 activation', s: ['Live vote', 'ends in 1d'], st: 'live' },
        { t: 'Node operator set expansion (+12)', s: ['Passed', '49% quorum'], st: 'pass' },
        { t: 'Staking router fee adjustment', s: ['Failed', '11% turnout'], st: 'fail' },
      ],
    },
    {
      id: 'arb', name: 'Arbitrum', mono: 'ARB', color: '#29A3F0', glow: 'rgba(41,163,240,0.6)',
      ring: 4, delay: -15, score: 76.8, tag: 'good', tagLabel: 'Healthy',
      turnout: 31.5, decentral: 69, proposals30: 11, treasury: '$2.4B', transparency: 81, holders: '625K',
      metrics: [
        { lab: 'Voter Turnout', val: '31.5', u: '%', pct: 32, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '69', u: '/100', pct: 69, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '11', u: '', pct: 70, c: 'var(--mint)' },
        { lab: 'Transparency', val: '81', u: '/100', pct: 81, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Gaming Catalyst Program oversight', s: ['Passed', '63% quorum'], st: 'pass' },
        { t: 'Stylus mainnet incentive budget', s: ['Live vote', 'ends in 4d'], st: 'live' },
        { t: 'Security Council seat rotation', s: ['Passed', '67% turnout'], st: 'pass' },
      ],
    },
    {
      id: 'gtc', name: 'Gitcoin', mono: 'GTC', color: '#12B981', glow: 'rgba(18,185,129,0.6)',
      ring: 4, delay: -38, score: 63.9, tag: 'watch', tagLabel: 'Watch',
      turnout: 19.7, decentral: 62, proposals30: 7, treasury: '$96M', transparency: 90, holders: '38K',
      metrics: [
        { lab: 'Voter Turnout', val: '19.7', u: '%', pct: 20, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '62', u: '/100', pct: 62, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '7', u: '', pct: 48, c: 'var(--mint)' },
        { lab: 'Transparency', val: '90', u: '/100', pct: 90, c: 'var(--amber)' },
      ],
      props: [
        { t: 'GG23 matching pool allocation', s: ['Passed', '57% quorum'], st: 'pass' },
        { t: 'Grants stack fee model revision', s: ['Live vote', 'ends in 6d'], st: 'live' },
        { t: 'Sunset legacy CLR rounds', s: ['Passed', '54% turnout'], st: 'pass' },
      ],
    },
    {
      id: 'aave', name: 'Aave', mono: 'AAVE', color: '#B6509E', glow: 'rgba(182,80,158,0.6)',
      ring: 2, delay: -14, score: 71.0, tag: 'good', tagLabel: 'Healthy',
      turnout: 26.4, decentral: 64, proposals30: 8, treasury: '$1.4B', transparency: 80, holders: '171K',
      metrics: [
        { lab: 'Voter Turnout', val: '26.4', u: '%', pct: 26, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '64', u: '/100', pct: 64, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '8', u: '', pct: 55, c: 'var(--mint)' },
        { lab: 'Transparency', val: '80', u: '/100', pct: 80, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Onboard sUSDe as collateral (V3)', s: ['Passed', '58% quorum'], st: 'pass' },
        { t: 'GHO interest rate strategy update', s: ['Live vote', 'ends in 3d'], st: 'live' },
        { t: 'Deprecate isolated stablecoin caps', s: ['Failed', '38% turnout'], st: 'fail' },
      ],
    },
    {
      id: 'crv', name: 'Curve', mono: 'CRV', color: '#F7C948', glow: 'rgba(247,201,72,0.55)',
      ring: 2, delay: -43, score: 60.2, tag: 'watch', tagLabel: 'Watch',
      turnout: 28.9, decentral: 47, proposals30: 12, treasury: '$320M', transparency: 71, holders: '52K',
      metrics: [
        { lab: 'Voter Turnout', val: '28.9', u: '%', pct: 29, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '47', u: '/100', pct: 47, c: 'var(--rose)' },
        { lab: 'Proposals · 30d', val: '12', u: '', pct: 78, c: 'var(--mint)' },
        { lab: 'Transparency', val: '71', u: '/100', pct: 71, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Gauge weight cap at 12%', s: ['Live vote', 'ends in 2d'], st: 'live' },
        { t: 'crvUSD mint cap increase', s: ['Passed', '51% quorum'], st: 'pass' },
        { t: 'Sunset legacy gauge factory', s: ['Failed', 'low turnout'], st: 'fail' },
      ],
    },
    {
      id: 'mkr', name: 'MakerDAO', mono: 'SKY', color: '#1AAB9B', glow: 'rgba(26,171,155,0.6)',
      ring: 3, delay: -27, score: 67.5, tag: 'watch', tagLabel: 'Watch',
      turnout: 19.5, decentral: 55, proposals30: 7, treasury: '$5.6B', transparency: 74, holders: '88K',
      metrics: [
        { lab: 'Voter Turnout', val: '19.5', u: '%', pct: 20, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '55', u: '/100', pct: 55, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '7', u: '', pct: 48, c: 'var(--mint)' },
        { lab: 'Transparency', val: '74', u: '/100', pct: 74, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Raise DSR to 8.0% for 90 days', s: ['Passed', '53% quorum'], st: 'pass' },
        { t: 'Spark Protocol allocation bump', s: ['Live vote', 'ends in 4d'], st: 'live' },
        { t: 'Endgame token migration phase 3', s: ['Passed', '61% quorum'], st: 'pass' },
      ],
    },
    {
      id: 'safe', name: 'Safe', mono: 'SAFE', color: '#12B886', glow: 'rgba(18,184,134,0.6)',
      ring: 3, delay: -64, score: 70.3, tag: 'good', tagLabel: 'Healthy',
      turnout: 23.1, decentral: 63, proposals30: 5, treasury: '$210M', transparency: 82, holders: '140K',
      metrics: [
        { lab: 'Voter Turnout', val: '23.1', u: '%', pct: 23, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '63', u: '/100', pct: 63, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '5', u: '', pct: 35, c: 'var(--mint)' },
        { lab: 'Transparency', val: '82', u: '/100', pct: 82, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Activate SAFE transferability phase 2', s: ['Live vote', 'ends in 1d'], st: 'live' },
        { t: 'Safenet relayer incentive budget', s: ['Passed', '56% quorum'], st: 'pass' },
        { t: 'Treasury management mandate', s: ['Passed', '60% turnout'], st: 'pass' },
      ],
    },
    {
      id: 'comp', name: 'Compound', mono: 'COMP', color: '#00D395', glow: 'rgba(0,211,149,0.6)',
      ring: 4, delay: -61, score: 64.8, tag: 'watch', tagLabel: 'Watch',
      turnout: 17.2, decentral: 60, proposals30: 6, treasury: '$640M', transparency: 77, holders: '224K',
      metrics: [
        { lab: 'Voter Turnout', val: '17.2', u: '%', pct: 17, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '60', u: '/100', pct: 60, c: 'var(--indigo-bright)' },
        { lab: 'Proposals · 30d', val: '6', u: '', pct: 40, c: 'var(--mint)' },
        { lab: 'Transparency', val: '77', u: '/100', pct: 77, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Deploy Comet USDC market on Unichain', s: ['Queued', '2-day timelock'], st: 'live' },
        { t: 'Reserve factor adjustment — ETH', s: ['Passed', '54% quorum'], st: 'pass' },
        { t: 'Retire v2 cETH market', s: ['Failed', '33% turnout'], st: 'fail' },
      ],
    },
    {
      id: 'ape', name: 'ApeCoin', mono: 'APE', color: '#0066FF', glow: 'rgba(0,102,255,0.6)',
      ring: 4, delay: -84, score: 46.9, tag: 'risk', tagLabel: 'At Risk',
      turnout: 11.8, decentral: 44, proposals30: 9, treasury: '$240M', transparency: 68, holders: '101K',
      metrics: [
        { lab: 'Voter Turnout', val: '11.8', u: '%', pct: 12, c: 'var(--cyan)' },
        { lab: 'Decentralization', val: '44', u: '/100', pct: 44, c: 'var(--rose)' },
        { lab: 'Proposals · 30d', val: '9', u: '', pct: 60, c: 'var(--mint)' },
        { lab: 'Transparency', val: '68', u: '/100', pct: 68, c: 'var(--amber)' },
      ],
      props: [
        { t: 'Sunset the APE Foundation board', s: ['Failed', 'no quorum'], st: 'fail' },
        { t: 'ApeChain ecosystem fund renewal', s: ['Live vote', 'ends in 5d'], st: 'live' },
        { t: 'Staking rewards schedule v3', s: ['Passed', '49% quorum'], st: 'pass' },
      ],
    },
  ];

  // Metric ring labels keyed by ring index
  const RINGS = {
    2: { name: 'Voter Turnout',     val: '31.6%', cls: '' },
    3: { name: 'Decentralization',  val: '57 / 100', cls: 'indigo' },
    4: { name: 'Transparency',      val: '82 / 100', cls: 'amber' },
  };

  // Whale alert templates — wallet shortname cast XXk votes on [Proposal] @ DAO
  const WHALES = [
    { wallet: '0x7a3f…b2c1', votes: '1.84M', dao: 'Uniswap',  prop: 'UNI · Fee switch pilot',          pct: 19 },
    { wallet: 'a16z.eth',     votes: '4.20M', dao: 'Optimism', prop: 'OP · Grant Council renewal',       pct: 31 },
    { wallet: '0x9c1d…0e44', votes: '910K',  dao: 'Lido',     prop: 'LDO · Dual governance v2',         pct: 27 },
    { wallet: 'whale.eth',    votes: '2.05M', dao: 'Arbitrum', prop: 'ARB · Stylus incentive budget',    pct: 14 },
    { wallet: '0x3b8e…ff20', votes: '760K',  dao: 'ENS',      prop: 'ENS · Namechain migration',        pct: 22 },
    { wallet: '0xd44a…71ac', votes: '1.12M', dao: 'Gitcoin',  prop: 'GTC · GG23 matching pool',         pct: 17 },
    { wallet: 'pantera.eth',  votes: '3.6M',  dao: 'Uniswap',  prop: 'UNI · Deploy v4 to Base',          pct: 24 },
    { wallet: '0x5f2c…9d18', votes: '640K',  dao: 'Optimism', prop: 'OP · Sequencer revenue split',     pct: 11 },
  ];

  return { DAOS, RINGS, WHALES };
})();

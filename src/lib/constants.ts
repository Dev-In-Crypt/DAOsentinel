// Threshold constants used across detectors and scoring
export const WHALE_VP_PCT_THRESHOLD = 5; // > 5% of total VP on a proposal is a "whale vote"
export const WHALE_CRITICAL_PCT = 20;
export const WHALE_WARNING_PCT = 10;
export const LAST_MINUTE_WINDOW_PCT = 0.1; // final 10% of voting window
export const QUORUM_RISK_THRESHOLD = 0.8; // alert when active proposal is in final stretch with < 80% quorum
export const SCORE_DROP_ALERT = 5; // Democracy Score drop > 5 points triggers an alert
export const COORDINATED_VOTING_MIN = 3; // 3+ addresses with shared funder
export const SUMMARY_BODY_TRUNCATE = 3000;

export const SCORE_WEIGHTS = {
  participation: 0.25,
  powerDistribution: 0.25,
  proposalDiversity: 0.15,
  delegateAccountability: 0.15,
  manipulationResistance: 0.2,
} as const;

export interface TrackedDao {
  snapshotSpaceId: string;
  name: string;
  slug: string;
  chain: string;
  token: string;
  website?: string;
  logoUrl?: string;
  /**
   * Tally Governor organisation id (string of digits). When set, the
   * `sync-tally` cron will also pull on-chain proposals for this DAO and
   * upsert them with `source = 'tally'`. Pre-populated for DAOs that have a
   * canonical on-chain Governor.
   */
  tallyOrgId?: string;
}

// Initial top-tier DAO list. Easily expandable; sync will fail-soft on bad spaces.
export const TRACKED_DAOS: TrackedDao[] = [
  { snapshotSpaceId: 'uniswapgovernance.eth', name: 'Uniswap', slug: 'uniswap', chain: 'ethereum', token: 'UNI', website: 'https://uniswap.org', tallyOrgId: '2206072050315953936' },
  { snapshotSpaceId: 'aave.eth', name: 'Aave', slug: 'aave', chain: 'ethereum', token: 'AAVE', website: 'https://aave.com', tallyOrgId: '2206072050458560434' },
  { snapshotSpaceId: 'ens.eth', name: 'ENS', slug: 'ens', chain: 'ethereum', token: 'ENS', website: 'https://ens.domains', tallyOrgId: '2206072049313620911' },
  { snapshotSpaceId: 'arbitrumfoundation.eth', name: 'Arbitrum', slug: 'arbitrum', chain: 'arbitrum', token: 'ARB', website: 'https://arbitrum.foundation', tallyOrgId: '2206072050315953754' },
  { snapshotSpaceId: 'opcollective.eth', name: 'Optimism', slug: 'optimism', chain: 'optimism', token: 'OP', website: 'https://optimism.io', tallyOrgId: '2206072050458560426' },
  { snapshotSpaceId: 'gitcoindao.eth', name: 'Gitcoin', slug: 'gitcoin', chain: 'ethereum', token: 'GTC', website: 'https://gitcoin.co' },
  { snapshotSpaceId: 'apecoin.eth', name: 'ApeCoin', slug: 'apecoin', chain: 'ethereum', token: 'APE', website: 'https://apecoin.com' },
  { snapshotSpaceId: 'balancer.eth', name: 'Balancer', slug: 'balancer', chain: 'ethereum', token: 'BAL', website: 'https://balancer.fi' },
  { snapshotSpaceId: 'curve.eth', name: 'Curve', slug: 'curve', chain: 'ethereum', token: 'CRV', website: 'https://curve.fi' },
  { snapshotSpaceId: 'lido-snapshot.eth', name: 'Lido', slug: 'lido', chain: 'ethereum', token: 'LDO', website: 'https://lido.fi' },
  { snapshotSpaceId: 'sushigov.eth', name: 'SushiSwap', slug: 'sushi', chain: 'ethereum', token: 'SUSHI', website: 'https://sushi.com' },
  { snapshotSpaceId: 'snapshot.dcl.eth', name: 'Decentraland', slug: 'decentraland', chain: 'ethereum', token: 'MANA', website: 'https://decentraland.org' },
  { snapshotSpaceId: 'gnosis.eth', name: 'Gnosis', slug: 'gnosis', chain: 'gnosis', token: 'GNO', website: 'https://gnosis.io' },
  { snapshotSpaceId: 'safe.eth', name: 'Safe', slug: 'safe', chain: 'ethereum', token: 'SAFE', website: 'https://safe.global' },
  { snapshotSpaceId: 'comp-vote.eth', name: 'Compound', slug: 'compound', chain: 'ethereum', token: 'COMP', website: 'https://compound.finance', tallyOrgId: '2206072050022352213' },
  { snapshotSpaceId: 'stgdao.eth', name: 'Stargate', slug: 'stargate', chain: 'ethereum', token: 'STG', website: 'https://stargate.finance' },
  { snapshotSpaceId: '1inch.eth', name: '1inch', slug: '1inch', chain: 'ethereum', token: '1INCH', website: 'https://1inch.io' },
  { snapshotSpaceId: 'rocketpool-dao.eth', name: 'Rocket Pool', slug: 'rocket-pool', chain: 'ethereum', token: 'RPL', website: 'https://rocketpool.net' },
  { snapshotSpaceId: 'gauntlet.eth', name: 'Gauntlet', slug: 'gauntlet', chain: 'ethereum', token: 'GAUNT', website: 'https://gauntlet.network' },
  { snapshotSpaceId: 'cvx.eth', name: 'Convex', slug: 'convex', chain: 'ethereum', token: 'CVX', website: 'https://convexfinance.com' },
  { snapshotSpaceId: 'frax.eth', name: 'Frax', slug: 'frax', chain: 'ethereum', token: 'FXS', website: 'https://frax.finance' },
  { snapshotSpaceId: 'olympusdao.eth', name: 'Olympus', slug: 'olympus', chain: 'ethereum', token: 'OHM', website: 'https://olympusdao.finance' },
  { snapshotSpaceId: 'instadapp-gov.eth', name: 'Instadapp', slug: 'instadapp', chain: 'ethereum', token: 'INST', website: 'https://instadapp.io' },
  { snapshotSpaceId: 'shutterdao0x36.eth', name: 'Shutter', slug: 'shutter', chain: 'ethereum', token: 'SHU', website: 'https://shutter.network' },
  { snapshotSpaceId: 'aavegotchi.eth', name: 'Aavegotchi', slug: 'aavegotchi', chain: 'polygon', token: 'GHST', website: 'https://aavegotchi.com' },
  { snapshotSpaceId: 'developerdao.eth', name: 'Developer DAO', slug: 'developer-dao', chain: 'ethereum', token: 'CODE', website: 'https://developerdao.com' },
  { snapshotSpaceId: 'gearbox.eth', name: 'Gearbox', slug: 'gearbox', chain: 'ethereum', token: 'GEAR', website: 'https://gearbox.fi' },
  { snapshotSpaceId: 'fei.eth', name: 'Fei', slug: 'fei', chain: 'ethereum', token: 'FEI' },
  { snapshotSpaceId: 'aavedao.eth', name: 'Aave DAO', slug: 'aave-dao', chain: 'ethereum', token: 'AAVE' },
  { snapshotSpaceId: 'jonesdao.eth', name: 'Jones DAO', slug: 'jones', chain: 'arbitrum', token: 'JONES' },
  { snapshotSpaceId: 'aladdindao.eth', name: 'Aladdin DAO', slug: 'aladdin', chain: 'ethereum', token: 'ALD' },
  { snapshotSpaceId: 'angle-dao.eth', name: 'Angle', slug: 'angle', chain: 'ethereum', token: 'ANGLE' },
  { snapshotSpaceId: 'beets.eth', name: 'Beethoven X', slug: 'beethoven-x', chain: 'fantom', token: 'BEETS' },
  { snapshotSpaceId: 'btrfly.eth', name: 'Redacted Cartel', slug: 'redacted', chain: 'ethereum', token: 'BTRFLY' },
  { snapshotSpaceId: 'chainflip-gov.eth', name: 'Chainflip', slug: 'chainflip', chain: 'ethereum', token: 'FLIP' },
  { snapshotSpaceId: 'dydxgov.eth', name: 'dYdX', slug: 'dydx', chain: 'ethereum', token: 'DYDX', website: 'https://dydx.exchange', tallyOrgId: '2206072050022352230' },
  { snapshotSpaceId: 'enssecuritycouncil.eth', name: 'ENS Security Council', slug: 'ens-security', chain: 'ethereum', token: 'ENS' },
  { snapshotSpaceId: 'metricsdao.eth', name: 'MetricsDAO', slug: 'metrics-dao', chain: 'ethereum', token: 'MET' },
  { snapshotSpaceId: 'nftx.eth', name: 'NFTX', slug: 'nftx', chain: 'ethereum', token: 'NFTX' },
  { snapshotSpaceId: 'paladin-gov.eth', name: 'Paladin', slug: 'paladin', chain: 'ethereum', token: 'PAL' },
  { snapshotSpaceId: 'rabbithole.eth', name: 'RabbitHole', slug: 'rabbithole', chain: 'ethereum', token: 'RBH' },
  { snapshotSpaceId: 'radiantcapital.eth', name: 'Radiant Capital', slug: 'radiant', chain: 'arbitrum', token: 'RDNT' },
  { snapshotSpaceId: 'spool-dao.eth', name: 'Spool', slug: 'spool', chain: 'ethereum', token: 'SPOOL' },
  { snapshotSpaceId: 'starkware.eth', name: 'StarkNet', slug: 'starknet', chain: 'ethereum', token: 'STRK' },
  { snapshotSpaceId: 'synthetixdao.eth', name: 'Synthetix', slug: 'synthetix', chain: 'optimism', token: 'SNX', website: 'https://synthetix.io' },
  { snapshotSpaceId: 'thedaomakerdao.eth', name: 'Maker DAO', slug: 'makerdao', chain: 'ethereum', token: 'MKR', website: 'https://makerdao.com' },
  { snapshotSpaceId: 'truefigov.eth', name: 'TrueFi', slug: 'truefi', chain: 'ethereum', token: 'TRU' },
  { snapshotSpaceId: 'velodromefinance.eth', name: 'Velodrome', slug: 'velodrome', chain: 'optimism', token: 'VELO' },
  { snapshotSpaceId: 'yam.eth', name: 'YAM Finance', slug: 'yam', chain: 'ethereum', token: 'YAM' },
  { snapshotSpaceId: 'yearn', name: 'Yearn', slug: 'yearn', chain: 'ethereum', token: 'YFI', website: 'https://yearn.finance' },
];

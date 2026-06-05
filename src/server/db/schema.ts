import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// =============================================
// DAOs
// =============================================
export const daos = pgTable(
  'daos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotSpaceId: text('snapshot_space_id').unique(),
    tallyOrgId: text('tally_org_id'),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    logoUrl: text('logo_url'),
    website: text('website'),
    chain: text('chain'),
    governanceToken: text('governance_token'),
    tokenContract: text('token_contract'),
    treasuryUsd: numeric('treasury_usd', { precision: 20, scale: 2 }),
    tokenPriceUsd: numeric('token_price_usd', { precision: 18, scale: 8 }),

    democracyScore: numeric('democracy_score', { precision: 5, scale: 2 }).default('0'),
    scoreUpdatedAt: timestamp('score_updated_at', { withTimezone: true }),
    scoreBreakdown: jsonb('score_breakdown').$type<Record<string, number>>(),

    totalProposals: integer('total_proposals').default(0),
    totalVoters: integer('total_voters').default(0),
    avgParticipationRate: numeric('avg_participation_rate', { precision: 5, scale: 4 }).default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    snapshotIdx: index('idx_daos_snapshot').on(t.snapshotSpaceId),
    scoreIdx: index('idx_daos_score').on(t.democracyScore),
  }),
);

// =============================================
// PROPOSALS
// =============================================
export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    daoId: uuid('dao_id')
      .notNull()
      .references(() => daos.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    source: text('source').notNull(), // snapshot | tally | aragon

    title: text('title').notNull(),
    body: text('body'),
    discussion: text('discussion'), // Snapshot proposers' optional forum/discussion URL
    author: text('author').notNull(),
    choices: jsonb('choices').$type<string[]>().notNull(),

    aiSummary: text('ai_summary'),
    aiImpact: text('ai_impact'),
    aiRiskLevel: text('ai_risk_level'), // low | medium | high
    summaryGeneratedAt: timestamp('summary_generated_at', { withTimezone: true }),

    state: text('state').notNull(), // active | closed | pending
    votingType: text('voting_type'),
    startTimestamp: timestamp('start_timestamp', { withTimezone: true }).notNull(),
    endTimestamp: timestamp('end_timestamp', { withTimezone: true }).notNull(),
    snapshotBlock: text('snapshot_block'),
    quorum: numeric('quorum'),
    quorumReached: boolean('quorum_reached').default(false),

    scores: jsonb('scores').$type<number[]>(),
    scoresTotal: numeric('scores_total'),
    votesCount: integer('votes_count').default(0),

    hasWhaleVote: boolean('has_whale_vote').default(false),
    hasLastMinuteSwing: boolean('has_last_minute_swing').default(false),
    isControversial: boolean('is_controversial').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    externalIdx: uniqueIndex('idx_proposals_external').on(t.daoId, t.externalId, t.source),
    stateIdx: index('idx_proposals_state').on(t.state, t.endTimestamp),
    daoIdx: index('idx_proposals_dao').on(t.daoId, t.createdAt),
  }),
);

// =============================================
// VOTES
// =============================================
export const votes = pgTable(
  'votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    daoId: uuid('dao_id')
      .notNull()
      .references(() => daos.id, { onDelete: 'cascade' }),

    voterAddress: text('voter_address').notNull(),
    choice: integer('choice').notNull(),
    votingPower: numeric('voting_power').notNull(),
    votingPowerPct: numeric('voting_power_pct', { precision: 7, scale: 4 }),
    reason: text('reason'),

    isWhale: boolean('is_whale').default(false),
    isLastMinute: boolean('is_last_minute').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    proposalVoterIdx: uniqueIndex('idx_votes_proposal_voter').on(t.proposalId, t.voterAddress),
    proposalIdx: index('idx_votes_proposal').on(t.proposalId),
    voterIdx: index('idx_votes_voter').on(t.voterAddress),
    whaleIdx: index('idx_votes_whale').on(t.proposalId, t.isWhale),
  }),
);

// =============================================
// DELEGATES
// =============================================
export const delegates = pgTable(
  'delegates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull(),

    name: text('name'),
    ensName: text('ens_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),

    totalDaosActive: integer('total_daos_active').default(0),
    totalVotesCast: integer('total_votes_cast').default(0),
    participationRate: numeric('participation_rate', { precision: 5, scale: 4 }),
    avgResponseTimeHours: numeric('avg_response_time_hours', { precision: 8, scale: 2 }),
    consistencyScore: numeric('consistency_score', { precision: 5, scale: 2 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    addressIdx: uniqueIndex('idx_delegates_address').on(t.address),
  }),
);

export const delegateDaoActivity = pgTable(
  'delegate_dao_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    delegateId: uuid('delegate_id')
      .notNull()
      .references(() => delegates.id, { onDelete: 'cascade' }),
    daoId: uuid('dao_id')
      .notNull()
      .references(() => daos.id, { onDelete: 'cascade' }),

    votingPower: numeric('voting_power'),
    delegatorsCount: integer('delegators_count'),
    votesCast: integer('votes_cast').default(0),
    proposalsAvailable: integer('proposals_available').default(0),
    participationRate: numeric('participation_rate', { precision: 5, scale: 4 }),

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    delegateDaoIdx: uniqueIndex('idx_delegate_dao').on(t.delegateId, t.daoId),
  }),
);

// =============================================
// ALERTS
// =============================================
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    daoId: uuid('dao_id')
      .notNull()
      .references(() => daos.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'cascade' }),

    type: text('type').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),

    data: jsonb('data').$type<Record<string, unknown>>(),

    publishedToX: boolean('published_to_x').default(false),
    publishedToTelegram: boolean('published_to_telegram').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    daoIdx: index('idx_alerts_dao').on(t.daoId, t.createdAt),
    typeIdx: index('idx_alerts_type').on(t.type, t.createdAt),
  }),
);

// =============================================
// SCORE HISTORY
// =============================================
export const scoreHistory = pgTable(
  'score_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    daoId: uuid('dao_id')
      .notNull()
      .references(() => daos.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    breakdown: jsonb('breakdown').$type<Record<string, number>>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    daoIdx: index('idx_score_history').on(t.daoId, t.computedAt),
  }),
);

// =============================================
// USERS
// =============================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  name: text('name'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  image: text('image'),
  plan: text('plan').notNull().default('free'), // free | delegate_pro | fund_suite
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),

  watchedDaos: text('watched_daos').array().default(sql`'{}'::text[]`),
  watchedDelegates: text('watched_delegates').array().default(sql`'{}'::text[]`),

  alertEmail: boolean('alert_email').default(true),
  alertTelegram: boolean('alert_telegram').default(false),
  telegramChatId: text('telegram_chat_id'),

  apiKey: text('api_key').unique(),
  apiCallsThisMonth: integer('api_calls_this_month').default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================
// NEXTAUTH TABLES
// =============================================
// The `accounts` table is required by the NextAuth Drizzle adapter as a typed
// reference, but is only populated when an OAuth/OIDC provider (Google, GitHub,
// etc.) is wired up. With the Resend magic-link provider we use, NextAuth
// writes only to `users` + `sessions` + `verification_tokens`. Empty `accounts`
// is expected, not a bug.
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => ({
    providerIdx: uniqueIndex('idx_accounts_provider').on(t.provider, t.providerAccountId),
  }),
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: uniqueIndex('idx_verification_pk').on(t.identifier, t.token),
  }),
);

// =============================================
// NEWSLETTER SUBSCRIBERS
// =============================================
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  isActive: boolean('is_active').default(true),
  subscribedAt: timestamp('subscribed_at', { withTimezone: true }).defaultNow().notNull(),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
});

// =============================================
// RELATIONS
// =============================================
export const daosRelations = relations(daos, ({ many }) => ({
  proposals: many(proposals),
  votes: many(votes),
  alerts: many(alerts),
  scoreHistory: many(scoreHistory),
  delegateActivity: many(delegateDaoActivity),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  dao: one(daos, { fields: [proposals.daoId], references: [daos.id] }),
  votes: many(votes),
  alerts: many(alerts),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  proposal: one(proposals, { fields: [votes.proposalId], references: [proposals.id] }),
  dao: one(daos, { fields: [votes.daoId], references: [daos.id] }),
}));

export const delegatesRelations = relations(delegates, ({ many }) => ({
  activity: many(delegateDaoActivity),
}));

export const delegateDaoActivityRelations = relations(delegateDaoActivity, ({ one }) => ({
  delegate: one(delegates, { fields: [delegateDaoActivity.delegateId], references: [delegates.id] }),
  dao: one(daos, { fields: [delegateDaoActivity.daoId], references: [daos.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  dao: one(daos, { fields: [alerts.daoId], references: [daos.id] }),
  proposal: one(proposals, { fields: [alerts.proposalId], references: [proposals.id] }),
}));

// Digests (weekly newsletter archive)
export const digests = pgTable('digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekOf: timestamp('week_of', { withTimezone: true }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  html: text('html'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Convenience types
export type Dao = typeof daos.$inferSelect;
export type NewDao = typeof daos.$inferInsert;
export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
export type Delegate = typeof delegates.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type User = typeof users.$inferSelect;

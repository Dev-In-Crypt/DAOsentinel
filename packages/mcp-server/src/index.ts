#!/usr/bin/env node
/**
 * MCP server exposing the DAO Sentinel public governance API as read-only
 * tools. Thin protocol translation over already-shipped, already-public
 * endpoints (/api/v1/*, /api/feed/*, /api/ics/*) — no new data work, no
 * new data exposure.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DEFAULT_BASE_URL, buildUrl, formatApiError } from './lib.js';

const BASE_URL = process.env.DAO_SENTINEL_BASE_URL || DEFAULT_BASE_URL;
const API_KEY = process.env.DAO_SENTINEL_API_KEY;

const NO_API_KEY_MESSAGE =
  'DAO_SENTINEL_API_KEY is not set. Get a free key at https://www.daosentinel.xyz/settings ' +
  '(5,000 calls/month, no card) and set it in this MCP server\'s environment.';

interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function textResult(text: string, isError = false): ToolTextResult {
  return { content: [{ type: 'text', text }], isError };
}

/** Calls an authenticated /api/v1/* endpoint and returns its JSON body as formatted text. */
async function callApi(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<ToolTextResult> {
  if (!API_KEY) return textResult(NO_API_KEY_MESSAGE, true);

  const url = buildUrl(BASE_URL, path, params);
  const res = await fetch(url, { headers: { authorization: `Bearer ${API_KEY}` } });
  const body = await res.json().catch(() => null);

  if (!res.ok) return textResult(formatApiError(res.status, body), true);
  return textResult(JSON.stringify(body, null, 2));
}

/** Fetches a public (no-auth) text endpoint — the Atom feed or an ICS calendar. */
async function fetchPublicText(url: string, notFoundMessage: string): Promise<ToolTextResult> {
  const res = await fetch(url);
  if (res.status === 404) return textResult(notFoundMessage, true);
  if (!res.ok) return textResult(`DAO Sentinel error ${res.status} fetching ${url}`, true);
  return textResult(await res.text());
}

const server = new McpServer({ name: 'dao-sentinel', version: '0.1.0' });

server.registerTool(
  'list_daos',
  {
    title: 'List DAOs',
    description:
      'List monitored DAOs with their current Democracy Score, treasury value, and chain. Requires a free DAO Sentinel API key (DAO_SENTINEL_API_KEY env var) — get one at /settings.',
    inputSchema: {
      limit: z.number().min(1).max(300).optional().describe('Max DAOs to return (default 100, max 300).'),
    },
  },
  async ({ limit }) => callApi('/api/v1/daos', { limit }),
);

server.registerTool(
  'list_proposals',
  {
    title: 'List proposals',
    description:
      'List governance proposals across all monitored DAOs, with AI summary and risk level. Filter by state or DAO slug. Requires DAO_SENTINEL_API_KEY.',
    inputSchema: {
      state: z.enum(['active', 'closed', 'pending']).optional().describe('Filter by proposal state.'),
      dao: z.string().optional().describe('Filter to one DAO by slug, e.g. "uniswap".'),
      limit: z.number().min(1).max(200).optional().describe('Max proposals to return (default 50, max 200).'),
      offset: z.number().min(0).optional().describe('Pagination offset.'),
    },
  },
  async ({ state, dao, limit, offset }) => callApi('/api/v1/proposals', { state, dao, limit, offset }),
);

server.registerTool(
  'list_alerts',
  {
    title: 'List governance alerts',
    description:
      'List governance alerts (whale votes, last-minute swings, quorum risk, score drops) across all monitored DAOs. Filter by type or severity. Requires DAO_SENTINEL_API_KEY.',
    inputSchema: {
      type: z.string().optional().describe('Filter by alert type, e.g. "whale_vote".'),
      severity: z.enum(['info', 'warning', 'critical']).optional().describe('Filter by severity.'),
      limit: z.number().min(1).max(200).optional().describe('Max alerts to return (default 50, max 200).'),
    },
  },
  async ({ type, severity, limit }) => callApi('/api/v1/alerts', { type, severity, limit }),
);

server.registerTool(
  'get_alerts_feed',
  {
    title: 'Get the governance alerts Atom feed',
    description:
      'Fetch the public, no-auth Atom/RSS feed of governance alerts — global, or scoped to one DAO. Returns raw Atom XML.',
    inputSchema: {
      dao: z
        .string()
        .optional()
        .describe('DAO slug to scope the feed to one DAO, e.g. "uniswap". Omit for the global feed.'),
      severity: z
        .string()
        .optional()
        .describe('Comma-separated severities to include, e.g. "warning,critical".'),
    },
  },
  async ({ dao, severity }) => {
    const path = dao ? `/api/feed/dao/${encodeURIComponent(dao)}` : '/api/feed/alerts.xml';
    const url = buildUrl(BASE_URL, path, { severity });
    return fetchPublicText(url, `No DAO found with slug "${dao}".`);
  },
);

server.registerTool(
  'get_dao_calendar',
  {
    title: "Get a DAO's governance calendar",
    description:
      "Fetch the public, no-auth ICS calendar feed of a DAO's active-proposal voting deadlines. Returns raw ICS text (subscribe the same URL in a calendar app for a live feed).",
    inputSchema: {
      dao: z.string().describe('DAO slug, e.g. "uniswap".'),
    },
  },
  async ({ dao }) => {
    const url = buildUrl(BASE_URL, `/api/ics/dao/${encodeURIComponent(dao)}`, {});
    return fetchPublicText(url, `No DAO found with slug "${dao}".`);
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('dao-sentinel-mcp fatal error:', err);
  process.exit(1);
});

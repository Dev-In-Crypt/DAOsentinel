# dao-sentinel-mcp

An [MCP](https://modelcontextprotocol.io) server exposing the
[DAO Sentinel](https://daosentinel.xyz) public governance API — DAOs,
proposals, and alerts — as read-only tools for any MCP-compatible agent
(Claude Desktop, Claude Code, etc). Free public good, MIT-licensed, no new
data exposure beyond what's already public at `/api-docs`.

## Install

```bash
npm install -g dao-sentinel-mcp
```

## Configure

Three of the five tools (`list_daos`, `list_proposals`, `list_alerts`)
read the authenticated `/api/v1/*` endpoints and need a free API key from
[Settings](https://daosentinel.xyz/settings) (any signed-in account, 5,000
calls/month, no card). The other two (`get_alerts_feed`,
`get_dao_calendar`) are fully public — no key needed.

Add to your MCP client's config (e.g. Claude Desktop's
`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dao-sentinel": {
      "command": "dao-sentinel-mcp",
      "env": {
        "DAO_SENTINEL_API_KEY": "gw_xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

`DAO_SENTINEL_BASE_URL` is also respected, for self-hosted instances —
defaults to `https://www.daosentinel.xyz`.

## Tools

| Tool | Auth | Description |
|---|---|---|
| `list_daos` | key | Monitored DAOs with Democracy Score, treasury, chain |
| `list_proposals` | key | Proposals across all DAOs — filter by state/DAO, paginate |
| `list_alerts` | key | Whale votes, swings, quorum risk, score drops — filter by type/severity |
| `get_alerts_feed` | none | Public Atom/RSS feed of alerts, global or per-DAO |
| `get_dao_calendar` | none | Public ICS calendar of a DAO's active-proposal deadlines |

Full endpoint reference and response shapes:
[daosentinel.xyz/api-docs](https://daosentinel.xyz/api-docs). There's also
a typed [JS/TS SDK](../sdk-js) if you're building your own client instead
of an MCP tool.

## Develop

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest — pure helper functions only, no live network calls
```

Manual smoke test against a real MCP client: point your client's config at
`node dist/index.js` (after `npm run build`) with `DAO_SENTINEL_API_KEY`
set, and call `list_daos`.

## License

MIT — see [LICENSE](./LICENSE). Same license as the
[main DAO Sentinel repo](https://github.com/Dev-In-Crypt/DAOsentinel).

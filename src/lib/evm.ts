/**
 * TODO-074: the minimum on-chain lookup needed to tell a person's wallet from
 * a contract, and a contract from a multisig.
 *
 * Scope is deliberately tiny — `eth_getCode` plus two `eth_call`s — because
 * that is all the report needs to stop calling a 68%-of-the-vote address an
 * "unidentified wallet" when it is in fact a 2-of-3 multisig.
 *
 * Transport is plain `fetch` rather than a viem client: this needs a hard
 * timeout, a never-throw contract, and no per-chain client cache, and hand-
 * rolling that around `fetch` is less code than bending a client to it. Only
 * the ABI decoding uses viem, where hand-rolled hex slicing would be the risky
 * part.
 */

/**
 * Keyless public endpoints, one per chain present in `daos.chain`.
 *
 * Every one of these was verified to answer `eth_chainId` with the right id
 * before being listed. `polygon-rpc.com`, `rpc.ankr.com` and `rpc.ftm.tools`
 * are deliberately absent — they now reject keyless requests, and a URL that
 * 403s is worse than an absent chain because it degrades silently.
 */
export const CHAIN_RPC_URLS: Readonly<Record<string, string>> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  optimism: 'https://optimism-rpc.publicnode.com',
  gnosis: 'https://gnosis-rpc.publicnode.com',
  fantom: 'https://fantom.drpc.org',
};

/**
 * Alchemy subdomains for the chains it serves. Used only when
 * `ALCHEMY_API_KEY` is set and non-empty; otherwise the public endpoint above
 * is used. Note the key is declared but empty in some environments, which is
 * why emptiness — not just absence — has to disqualify it.
 */
const ALCHEMY_SUBDOMAINS: Readonly<Record<string, string>> = {
  ethereum: 'eth-mainnet',
  polygon: 'polygon-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
};

const RPC_TIMEOUT_MS = 8_000;

/** Selectors we call. Kept as literals — three of them do not justify an ABI. */
const SELECTOR = {
  /** Safe + legacy Gnosis MultiSigWallet: `getOwners()` */
  getOwners: '0xa0e67e2b',
  /** Gnosis Safe: `getThreshold()` */
  getThreshold: '0xe75235b8',
  /** Legacy Gnosis MultiSigWallet: `required()` — Safe's predecessor named it differently. */
  required: '0xdc8452cd',
} as const;

export function rpcUrlFor(chain: string | null | undefined): string | null {
  if (!chain) return null;
  const key = chain.trim().toLowerCase();

  const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
  const subdomain = ALCHEMY_SUBDOMAINS[key];
  if (alchemyKey && subdomain) {
    return `https://${subdomain}.g.alchemy.com/v2/${alchemyKey}`;
  }

  return CHAIN_RPC_URLS[key] ?? null;
}

/**
 * One JSON-RPC call. Returns the `result` string, or null for *any* failure —
 * unreachable host, timeout, JSON-RPC error object, malformed body.
 *
 * Never throws. Address identification is an enrichment: a chain being down
 * must downgrade a label, never fail a paying customer's report.
 */
async function rpcCall(
  url: string,
  method: string,
  params: unknown[],
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return null;

    const record = body as { result?: unknown; error?: unknown };
    if (record.error) return null;
    return typeof record.result === 'string' ? record.result : null;
  } catch {
    return null;
  }
}

/** `0x`, `0x0`, and any all-zero body all mean "no code here". */
function hasCode(result: string | null): boolean {
  if (result === null) return false;
  const hex = result.replace(/^0x/, '');
  return hex.length > 0 && !/^0*$/.test(hex);
}

/**
 * ABI decoding, hand-rolled rather than via viem.
 *
 * viem is a dependency and was the first choice here, but importing from its
 * root barrel drags in the WebSocket transport, which needs `ws` — a module
 * the Next build cannot resolve, and the build fails outright. The two shapes
 * this file needs are a single `uint256` and the LENGTH of an `address[]`;
 * pulling an RPC client library into the bundle to read two integers is the
 * wrong trade.
 */
const WORD_HEX = 64;

function words(result: string): string[] {
  const hex = result.replace(/^0x/, '');
  const out: string[] = [];
  for (let i = 0; i + WORD_HEX <= hex.length; i += WORD_HEX) {
    out.push(hex.slice(i, i + WORD_HEX));
  }
  return out;
}

function decodeUint(result: string | null): number | null {
  if (!result || result === '0x') return null;
  const [word] = words(result);
  if (!word) return null;
  try {
    const value = Number(BigInt(`0x${word}`));
    return Number.isSafeInteger(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Length of a returned `address[]`, not the addresses themselves — the count is
 * all the report shows, and skipping the element decode removes the only part
 * of this that could mangle an address.
 *
 * Layout: word 0 is the byte offset of the array, and the word AT that offset
 * is its length. The offset is read rather than assumed to be 0x20, since that
 * assumption is only true for a single dynamic return value.
 */
function decodeAddressCount(result: string | null): number | null {
  if (!result || result === '0x') return null;
  const w = words(result);
  if (w.length < 2) return null;
  try {
    const offsetBytes = Number(BigInt(`0x${w[0]}`));
    if (!Number.isSafeInteger(offsetBytes) || offsetBytes % 32 !== 0) return null;
    const lengthWord = w[offsetBytes / 32];
    if (lengthWord === undefined) return null;
    const length = Number(BigInt(`0x${lengthWord}`));
    // A length past what the payload can hold means we misread the layout.
    if (!Number.isSafeInteger(length) || length > w.length) return null;
    return length;
  } catch {
    return null;
  }
}

export type AccountKind = 'eoa' | 'multisig' | 'contract';

export interface OnChainAccount {
  kind: AccountKind;
  /** Owner count, only for `multisig`. */
  signerCount: number | null;
  /** Signatures required, only for `multisig` and only when the contract exposes it. */
  threshold: number | null;
}

/**
 * Classifies one address on one chain.
 *
 * Returns null when the question could not be asked at all — unknown chain, no
 * endpoint, RPC unreachable. That is distinct from `{ kind: 'eoa' }`, which is
 * a positive finding: the chain answered, and there is no code at the address.
 * Callers must not collapse the two — "we could not check" and "it is a
 * personal wallet" mean very different things in a report.
 *
 * Multisig detection asks the contract itself rather than matching bytecode:
 * a contract that returns an owner array from `getOwners()` is a multisig by
 * its own account. The threshold is read from `getThreshold()` (Gnosis Safe)
 * falling back to `required()` (the legacy Gnosis MultiSigWallet, which is
 * what several long-lived DAO treasuries actually run — Aavegotchi's is a
 * 2-of-3 of exactly this kind, and a Safe-only check would have mislabelled
 * it as a plain contract).
 */
export async function classifyOnChainAccount(
  address: string,
  chain: string | null | undefined,
): Promise<OnChainAccount | null> {
  const url = rpcUrlFor(chain);
  if (!url) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;

  const code = await rpcCall(url, 'eth_getCode', [address, 'latest']);
  if (code === null) return null;
  if (!hasCode(code)) return { kind: 'eoa', signerCount: null, threshold: null };

  const owners = await rpcCall(url, 'eth_call', [{ to: address, data: SELECTOR.getOwners }, 'latest']);
  const signerCount = decodeAddressCount(owners);
  if (signerCount === null || signerCount === 0) {
    return { kind: 'contract', signerCount: null, threshold: null };
  }

  const [safeThreshold, legacyRequired] = await Promise.all([
    rpcCall(url, 'eth_call', [{ to: address, data: SELECTOR.getThreshold }, 'latest']),
    rpcCall(url, 'eth_call', [{ to: address, data: SELECTOR.required }, 'latest']),
  ]);

  return {
    kind: 'multisig',
    signerCount,
    threshold: decodeUint(safeThreshold) ?? decodeUint(legacyRequired),
  };
}

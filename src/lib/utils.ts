import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const num = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(decimals);
}

export function formatUSD(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${formatNumber(value, 0)}`;
}

/**
 * Format token amount × price as a compact USD value, e.g. `≈$13.4M`.
 * Returns null when either input is missing so the caller can choose
 * whether to render anything.
 */
export function formatUsdValue(
  tokens: number,
  pricePerToken: number | string | null | undefined,
): string | null {
  const price = typeof pricePerToken === 'string' ? Number(pricePerToken) : pricePerToken;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(tokens)) return null;
  const usd = tokens * price;
  if (usd < 1) return null;
  if (usd >= 1e9) return `≈$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `≈$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `≈$${(usd / 1e3).toFixed(1)}K`;
  return `≈$${usd.toFixed(0)}`;
}

export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function timeAgo(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function timeRemaining(end: Date | string | number): string {
  const d = typeof end === 'object' ? end : new Date(end);
  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'ended';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m left`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h left`;
  return `${Math.floor(seconds / 86400)}d left`;
}

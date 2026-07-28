import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../scripts/activate-org';

const BASE = ['--name', 'Acme', '--tier', 'concierge', '--email', 'billing@acme.xyz'];

describe('activate-org parseArgs', () => {
  it('parses required flags with a normal --daos list', () => {
    const args = parseArgs([...BASE, '--daos', 'acme,acme-grants']);
    expect(args.name).toBe('Acme');
    expect(args.daoSlugs).toEqual(['acme', 'acme-grants']);
    expect(args.tier).toBe('concierge');
    expect(args.billingContactEmail).toBe('billing@acme.xyz');
  });

  it('rejects missing required flags', () => {
    expect(() => parseArgs(['--name', 'Acme'])).toThrow(/Missing required flag/);
  });

  it('--all-daos produces an empty daoSlugs array', () => {
    const args = parseArgs([...BASE, '--all-daos']);
    expect(args.daoSlugs).toEqual([]);
  });

  it('rejects --all-daos combined with --daos', () => {
    expect(() => parseArgs([...BASE, '--all-daos', '--daos', 'acme'])).toThrow(
      /mutually exclusive/,
    );
  });

  it('requires --daos when --all-daos is absent', () => {
    expect(() => parseArgs(BASE)).toThrow(/--daos \(or --all-daos\)/);
  });

  it('rejects an empty --daos list (all-whitespace/commas)', () => {
    expect(() => parseArgs([...BASE, '--daos', ' , ,'])).toThrow(
      /--daos must contain at least one non-empty DAO slug/,
    );
  });

  it('rejects an invalid --tier', () => {
    expect(() =>
      parseArgs(['--name', 'Acme', '--tier', 'enterprise', '--email', 'a@b.com', '--all-daos']),
    ).toThrow(/Invalid --tier/);
  });

  it('rejects a malformed --branding-primary-color', () => {
    expect(() =>
      parseArgs([...BASE, '--all-daos', '--branding-primary-color', 'not-a-color']),
    ).toThrow(/Invalid --branding-primary-color/);
  });

  it('accepts a valid #rrggbb --branding-primary-color', () => {
    const args = parseArgs([...BASE, '--all-daos', '--branding-primary-color', '#4f46e5']);
    expect(args.brandingPrimaryColor).toBe('#4f46e5');
  });

  it('accepts a valid #rgb --branding-primary-color', () => {
    const args = parseArgs([...BASE, '--all-daos', '--branding-primary-color', '#4fe']);
    expect(args.brandingPrimaryColor).toBe('#4fe');
  });

  it('parses subdomain and branding fields when provided', () => {
    const args = parseArgs([
      ...BASE,
      '--all-daos',
      '--subdomain',
      'acme',
      '--branding-logo-url',
      'https://example.com/logo.png',
      '--branding-display-name',
      'Acme Governance',
    ]);
    expect(args.subdomain).toBe('acme');
    expect(args.brandingLogoUrl).toBe('https://example.com/logo.png');
    expect(args.brandingDisplayName).toBe('Acme Governance');
  });

  it('leaves subdomain/branding fields undefined when omitted (no regression)', () => {
    const args = parseArgs([...BASE, '--daos', 'acme']);
    expect(args.subdomain).toBeUndefined();
    expect(args.brandingLogoUrl).toBeUndefined();
    expect(args.brandingPrimaryColor).toBeUndefined();
    expect(args.brandingDisplayName).toBeUndefined();
  });
});

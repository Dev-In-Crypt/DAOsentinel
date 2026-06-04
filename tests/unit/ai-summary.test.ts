import { describe, it, expect } from 'vitest';

/**
 * The AI summary module's JSON parser is the only piece we can test without
 * a live Anthropic key. It must be robust to:
 *   - clean JSON
 *   - JSON wrapped in ```json fences
 *   - JSON with leading/trailing prose
 *   - missing or invalid risk_level
 */

// Copy of the parser surface for direct testing. The implementation lives in
// src/server/services/ai-summary.ts; if it changes, sync here.
function parseSummaryJson(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  const p = parsed as Record<string, unknown>;
  const risk = String(p.riskLevel ?? p.risk_level ?? 'medium').toLowerCase();
  const riskLevel = ['low', 'medium', 'high'].includes(risk) ? risk : 'medium';
  if (!p.summary || !p.impact) return null;
  return { summary: String(p.summary), impact: String(p.impact), riskLevel };
}

describe('AI summary JSON parser', () => {
  it('parses clean JSON', () => {
    const out = parseSummaryJson(
      JSON.stringify({ summary: 'X', impact: 'Y', risk_level: 'high' }),
    );
    expect(out).toEqual({ summary: 'X', impact: 'Y', riskLevel: 'high' });
  });

  it('strips code fences', () => {
    const out = parseSummaryJson(
      '```json\n{"summary":"S","impact":"I","risk_level":"low"}\n```',
    );
    expect(out?.riskLevel).toBe('low');
  });

  it('extracts JSON from prose', () => {
    const out = parseSummaryJson(
      'Sure! Here is the JSON: {"summary":"A","impact":"B","risk_level":"medium"} Thanks.',
    );
    expect(out?.summary).toBe('A');
  });

  it('defaults invalid risk to medium', () => {
    const out = parseSummaryJson(
      JSON.stringify({ summary: 'X', impact: 'Y', risk_level: 'wat' }),
    );
    expect(out?.riskLevel).toBe('medium');
  });

  it('returns null on missing fields', () => {
    expect(parseSummaryJson(JSON.stringify({ summary: 'X' }))).toBeNull();
  });

  it('returns null on garbage', () => {
    expect(parseSummaryJson('definitely not json')).toBeNull();
  });
});

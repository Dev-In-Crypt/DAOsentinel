/**
 * Color helpers for white-label branding (TODO-058).
 *
 * The app's whole design system is built on CSS custom properties holding an
 * "H S% L%" triplet (e.g. `--indigo: 239 84% 67%;`), consumed everywhere as
 * `hsl(var(--indigo))`. An org's `brandingPrimaryColor` is stored as a plain
 * hex string (e.g. "#4f46e5") since that's what a non-technical client will
 * actually type into a branding form — this module converts that hex value
 * into the triplet format the CSS expects.
 */

export interface HslTriplet {
  h: number;
  s: number;
  l: number;
}

/**
 * Parses a `#rgb` / `#rrggbb` hex color into an HSL triplet.
 * Returns null for anything that isn't a well-formed hex color, so callers
 * can safely ignore malformed/legacy data instead of rendering broken CSS.
 */
export function hexToHsl(hex: string): HslTriplet | null {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;

  let raw = match[1];
  if (raw.length === 3) {
    raw = raw
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Formats an HSL triplet as the "H S% L%" string used by orbital.css tokens. */
export function hslTripletToCssValue({ h, s, l }: HslTriplet): string {
  return `${h} ${s}% ${l}%`;
}

/** Nudges lightness by `delta` percentage points, clamped to [0, 100]. */
export function withLightness(hsl: HslTriplet, delta: number): HslTriplet {
  return { ...hsl, l: Math.min(100, Math.max(0, hsl.l + delta)) };
}

/**
 * Converts a stored `brandingPrimaryColor` value into the CSS custom property
 * overrides needed to retheme the orbital palette's indigo family. Accepts a
 * hex color (the documented/expected format); anything else is ignored.
 */
export function brandColorToCssVars(brandingPrimaryColor: string | null | undefined) {
  if (!brandingPrimaryColor) return null;
  const hsl = hexToHsl(brandingPrimaryColor);
  if (!hsl) return null;

  return {
    '--indigo': hslTripletToCssValue(hsl),
    '--indigo-bright': hslTripletToCssValue(withLightness(hsl, 7)),
    '--indigo-deep': hslTripletToCssValue(withLightness(hsl, -17)),
    '--primary': hslTripletToCssValue(hsl),
    '--ring-line': `${hsl.h} ${hsl.s}% ${hsl.l}% / 0.22`,
  } as const;
}

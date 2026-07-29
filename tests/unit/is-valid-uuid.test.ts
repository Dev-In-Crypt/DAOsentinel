import { describe, it, expect } from 'vitest';
import { isValidUuid } from '@/lib/utils';

describe('isValidUuid', () => {
  it('accepts a well-formed uuid', () => {
    expect(isValidUuid('425969ec-92c2-494d-a525-3d73514e7072')).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(isValidUuid('425969EC-92C2-494D-A525-3D73514E7072')).toBe(true);
  });

  it('rejects a truncated uuid (the exact bug that caused a 500)', () => {
    expect(isValidUuid('425969ec-92c2-494d-a525-3d73514e707')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });

  it('rejects a non-uuid string', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('yearn')).toBe(false);
  });

  it('rejects a uuid with extra characters', () => {
    expect(isValidUuid('425969ec-92c2-494d-a525-3d73514e7072x')).toBe(false);
  });
});

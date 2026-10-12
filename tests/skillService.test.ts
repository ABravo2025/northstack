import { describe, expect, it } from 'vitest';
import { parseSkillName } from '../src/modules/shifts/skillService.js';

describe('parseSkillName', () => {
  it('trims and accepts a normal name', () => {
    expect(parseSkillName('  Reagent handling ')).toEqual({ success: true, value: 'Reagent handling' });
  });

  it('rejects empty, non-string and too-long names', () => {
    expect(parseSkillName('   ').success).toBe(false);
    expect(parseSkillName(42).success).toBe(false);
    expect(parseSkillName('x'.repeat(81)).success).toBe(false);
  });
});

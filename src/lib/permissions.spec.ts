import { describe, expect, it } from 'vitest';
import { roleHome } from './permissions';
describe('role routing', () => { it('routes roles only to visible working destinations', () => { expect(roleHome.finance).toBe('/finance'); expect(roleHome.hr).toBe('/'); }); });

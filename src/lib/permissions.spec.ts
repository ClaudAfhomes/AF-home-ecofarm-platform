import { describe, expect, it } from 'vitest';
import { roleHome } from './permissions';
describe('role routing', () => { it('keeps finance and HR in their authorized modules', () => { expect(roleHome.finance).toBe('/finance'); expect(roleHome.hr).toBe('/employees'); }); });

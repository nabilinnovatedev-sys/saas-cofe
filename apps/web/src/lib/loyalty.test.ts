import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ invoke: vi.fn() }));
import { deviceCredential } from './loyalty';

afterEach(() => vi.unstubAllGlobals());
describe('loyalty device identity', () => {
  function storage() {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) });
    return entries;
  }
  it('generates a 256-bit random credential and remembers the same café', () => {
    storage(); const first = deviceCredential('mondialito');
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceCredential('mondialito')).toBe(first);
  });
  it('does not reuse credentials across cafés', () => {
    storage(); expect(deviceCredential('cafe-a')).not.toBe(deviceCredential('cafe-b'));
  });
  it('replaces malformed persisted data', () => {
    storage().set('cafe-loyalty-v1:cafe-a', 'phone:0612345678');
    expect(deviceCredential('cafe-a')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('fails rather than registering an inaccessible card when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Storage blocked'); } });
    expect(() => deviceCredential('cafe-a')).toThrow('Storage blocked');
  });
});

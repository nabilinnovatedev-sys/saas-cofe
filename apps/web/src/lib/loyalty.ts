import { invoke } from './supabase';
export const loyalty = <T>(action: string, body: Record<string, unknown>) => invoke<T>('loyalty', { action, ...body });
export function deviceCredential(slug: string): string {
  const key = `cafe-loyalty-v1:${slug}`;
  const current = localStorage.getItem(key);
  if (current && /^[0-9a-f]{64}$/.test(current)) return current;
  const value = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(key, value);
  return value;
}

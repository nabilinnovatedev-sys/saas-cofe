export type LoyaltyProgram = {
  enabled: boolean; threshold: number; reward: string;
  background_color: string; surface_color: string; text_color: string; accent_color: string;
  logo_path: string | null; stamp: 'coffee' | 'gift' | 'star'; template: 'classic' | 'midnight' | 'ticket';
};
export type LoyaltyMember = { id?: string; name: string; phone: string; points: number; created_at?: string };
export type LoyaltyView = { program: LoyaltyProgram; cafe: { name: string; slug: string }; member: LoyaltyMember | null };
export type LoyaltyGrant = { id: string; url: string; expires_at: string };
export type LoyaltyReward = { name: string; phone_suffix: string; reward: string; cost: number; points: number };
export type LoyaltyEvent = { kind: 'award' | 'recover' | 'redeem'; delta: number; reward: string | null; created_at: string; name: string };
export const DEFAULT_LOYALTY: LoyaltyProgram = {
  enabled: false, threshold: 10, reward: 'Un café offert', background_color: '#203B32',
  surface_color: '#FFF8EB', text_color: '#203B32', accent_color: '#B67832', logo_path: null,
  stamp: 'coffee', template: 'classic',
};
export function loyaltyPhone(value: string): string {
  let phone = value.trim().replace(/[\s()+.\-]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[5-7]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('INVALID_PHONE');
  return phone;
}
export function loyaltyProgress(points: number, threshold: number) {
  const goal = Math.max(2, Math.min(100, Math.trunc(threshold) || 10));
  const balance = Math.max(0, Math.trunc(points) || 0);
  return { goal, balance, rewards: Math.floor(balance / goal), filled: Math.min(balance, goal), remaining: Math.max(0, goal - balance) };
}
export function loyaltyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const errors: Record<string, string> = {
    UNAVAILABLE: 'La fidélité est momentanément indisponible dans ce café.',
    NOT_CONFIGURED: 'Activez et enregistrez le programme fidélité avant de continuer.',
    FORBIDDEN: 'Votre compte ne peut pas gérer la fidélité de ce café.',
    RATE_LIMIT: 'Trop de tentatives. Patientez une minute.',
    STAFF_RECOVERY_REQUIRED: 'Cette inscription nécessite l’aide du serveur. Présentez-vous au comptoir pour retrouver votre carte.',
    INVALID_PHONE: 'Indiquez un numéro valide (ex. 0612345678 ou +212612345678).',
    INVALID_NAME: 'Indiquez votre nom (100 caractères maximum).',
    INVALID_CODE: 'Ce code est invalide. Demandez un nouveau code.',
    ALREADY_USED: 'Ce code a déjà été utilisé.', EXPIRED: 'Ce code a expiré. Demandez un nouveau code.',
    PROGRAM_CHANGED: 'La récompense a changé. Le client doit générer un nouveau code.',
    JOIN_FIRST: 'Complétez votre nom et votre téléphone pour créer votre carte.',
    NOT_FOUND: 'Aucune carte trouvée dans ce café.', NOT_ENOUGH_POINTS: 'Le nombre de points est insuffisant.',
    SERVICE_UNAVAILABLE: 'Service fidélité indisponible. Vérifiez le déploiement de la migration et de la fonction loyalty.',
  };
  const code = Object.keys(errors).find(key => message.includes(key));
  return code ? errors[code] : 'Action impossible. Vérifiez votre connexion puis réessayez.';
}

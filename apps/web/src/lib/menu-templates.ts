export const menuTemplates = [
  { id: 'grill', name: 'Burger & Grill', description: 'Couverture immersive, logo rond et carte épurée.', primary_color: '#111827', secondary_color: '#111827', accent_color: '#E11D48', hero_background_color: '#F1F5F9', logo_position: 'overlap' },
  { id: 'cafe', name: 'Café Maison', description: 'Tons café, typographie chaleureuse et cartes arrondies.', primary_color: '#70452B', secondary_color: '#476550', accent_color: '#A65B22', hero_background_color: '#F3E7D7', logo_position: 'center' },
  { id: 'garden', name: 'Fresh Garden', description: 'Vert profond, fond clair et grandes images de catégories.', primary_color: '#174E39', secondary_color: '#174E39', accent_color: '#476B24', hero_background_color: '#E7EFDF', logo_position: 'top' },
] as const;
export type TemplateId = typeof menuTemplates[number]['id'];
export const defaultCover = '/menu-cover.svg';

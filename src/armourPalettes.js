export const ARMOR_PALETTES = {
  diamond: {
    main: '#2ee8d6',
    dark: '#16998c',
    light: '#a6ffff',
    accent: '#106d64'
  },
  netherite: {
    main: '#423a40',
    dark: '#262024',
    light: '#655a62',
    accent: '#181316'
  },
  iron: {
    main: '#d8d8d8',
    dark: '#8e8e8e',
    light: '#ffffff',
    accent: '#6b6b6b'
  },
  golden: {
    main: '#f6d23e',
    dark: '#af8c17',
    light: '#fff596',
    accent: '#7f6208'
  },
  chainmail: {
    main: '#a0a0a0',
    dark: '#585858',
    light: '#d0d0d0',
    accent: '#3e3e3e'
  },
  leather: {
    main: '#8c5229',
    dark: '#562f14',
    light: '#b77443',
    accent: '#3d1f0b'
  },
  turtle: {
    main: '#2e8c45',
    dark: '#1b5a2b',
    light: '#5ec275',
    accent: '#123f1e'
  }
};

export function getArmorMaterial(item) {
  if (!item || !item.id) return null;
  const id = String(item.id).toLowerCase();
  if (id.includes('diamond')) return 'diamond';
  if (id.includes('netherite')) return 'netherite';
  if (id.includes('iron')) return 'iron';
  if (id.includes('golden') || id.includes('gold')) return 'golden';
  if (id.includes('chainmail') || id.includes('chain')) return 'chainmail';
  if (id.includes('leather')) return 'leather';
  if (id.includes('turtle')) return 'turtle';
  return 'iron';
}


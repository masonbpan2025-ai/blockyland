// Player Character Doll SVG Renderer (Minecraft Steve + Equipped Armor)

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

export function renderPlayerDollSVG(armor = {}) {
  const headItem = armor?.head || null;
  const chestItem = armor?.chest || null;
  const legsItem = armor?.legs || null;
  const feetItem = armor?.feet || null;

  const headMat = getArmorMaterial(headItem);
  const chestMat = getArmorMaterial(chestItem);
  const legsMat = getArmorMaterial(legsItem);
  const feetMat = getArmorMaterial(feetItem);

  let layers = '';

  // 1. Steve Base Body (16x32 pixel grid)
  layers += `
    <!-- Base Steve Body -->
    <g id="steve-base">
      <!-- Head Base & Hair -->
      <rect x="4" y="2" width="8" height="6" fill="#b97a57" />
      <rect x="4" y="0" width="8" height="2" fill="#4a3219" />
      <rect x="4" y="2" width="1" height="3" fill="#4a3219" />
      <rect x="11" y="2" width="1" height="3" fill="#4a3219" />
      <rect x="5" y="2" width="2" height="1" fill="#4a3219" />
      <rect x="9" y="2" width="2" height="1" fill="#4a3219" />

      <!-- Eyes -->
      <rect x="5" y="4" width="1" height="1" fill="#ffffff" />
      <rect x="6" y="4" width="1" height="1" fill="#2d3795" />
      <rect x="9" y="4" width="1" height="1" fill="#2d3795" />
      <rect x="10" y="4" width="1" height="1" fill="#ffffff" />

      <!-- Nose & Mouth -->
      <rect x="7" y="5" width="2" height="1" fill="#a46543" />
      <rect x="6" y="6" width="4" height="1" fill="#693d25" />

      <!-- Torso (Cyan Shirt) -->
      <rect x="4" y="8" width="8" height="12" fill="#009c9c" />
      <rect x="7" y="8" width="2" height="2" fill="#b97a57" />
      <rect x="4" y="19" width="8" height="1" fill="#007f7f" />

      <!-- Left Arm (Viewer Left) -->
      <rect x="0" y="8" width="4" height="4" fill="#009c9c" />
      <rect x="0" y="12" width="4" height="8" fill="#b97a57" />
      <rect x="0" y="18" width="4" height="2" fill="#a46543" />

      <!-- Right Arm (Viewer Right) -->
      <rect x="12" y="8" width="4" height="4" fill="#009c9c" />
      <rect x="12" y="12" width="4" height="8" fill="#b97a57" />
      <rect x="12" y="18" width="4" height="2" fill="#a46543" />

      <!-- Legs (Blue Pants) -->
      <rect x="4" y="20" width="4" height="9" fill="#2c3b88" />
      <rect x="8" y="20" width="4" height="9" fill="#253275" />
      <rect x="7.5" y="20" width="1" height="12" fill="#1b2457" />

      <!-- Shoes (Dark Gray) -->
      <rect x="4" y="29" width="4" height="3" fill="#444444" />
      <rect x="4" y="31" width="4" height="1" fill="#2a2a2a" />
      <rect x="8" y="29" width="4" height="3" fill="#383838" />
      <rect x="8" y="31" width="4" height="1" fill="#222222" />
    </g>
  `;

  // 2. Armor Overlays
  if (headMat) {
    const p = ARMOR_PALETTES[headMat] || ARMOR_PALETTES.iron;
    layers += `
      <!-- Head Armor (${headMat}) -->
      <g id="armor-head" data-material="${headMat}">
        <rect x="3" y="0" width="10" height="2" fill="${p.main}" />
        <rect x="6" y="0" width="4" height="1" fill="${p.light}" />
        <rect x="3" y="2" width="2" height="5" fill="${p.main}" />
        <rect x="11" y="2" width="2" height="5" fill="${p.dark}" />
        <rect x="5" y="2" width="6" height="1" fill="${p.main}" />
        <rect x="7" y="3" width="2" height="2" fill="${p.dark}" />
        <rect x="4" y="7" width="8" height="1" fill="${p.main}" />
      </g>
    `;
  }

  if (chestMat) {
    const p = ARMOR_PALETTES[chestMat] || ARMOR_PALETTES.iron;
    layers += `
      <!-- Chestplate Armor (${chestMat}) -->
      <g id="armor-chest" data-material="${chestMat}">
        <!-- Shoulders -->
        <rect x="0" y="8" width="4" height="5" fill="${p.main}" />
        <rect x="0" y="8" width="4" height="1" fill="${p.light}" />
        <rect x="12" y="8" width="4" height="5" fill="${p.dark}" />
        <rect x="12" y="8" width="4" height="1" fill="${p.main}" />

        <!-- Breastplate -->
        <rect x="4" y="8" width="8" height="11" fill="${p.main}" />
        <rect x="7" y="8" width="2" height="2" fill="#b97a57" />
        <rect x="5" y="10" width="2" height="6" fill="${p.light}" />
        <rect x="9" y="10" width="2" height="6" fill="${p.dark}" />
        <rect x="4" y="18" width="8" height="1" fill="${p.dark}" />
      </g>
    `;
  }

  if (legsMat) {
    const p = ARMOR_PALETTES[legsMat] || ARMOR_PALETTES.iron;
    layers += `
      <!-- Leggings Armor (${legsMat}) -->
      <g id="armor-legs" data-material="${legsMat}">
        <rect x="4" y="19" width="8" height="3" fill="${p.main}" />
        <rect x="7" y="19" width="2" height="2" fill="${p.light}" />
        <rect x="4" y="22" width="4" height="6" fill="${p.main}" />
        <rect x="4" y="25" width="3" height="2" fill="${p.light}" />
        <rect x="8" y="22" width="4" height="6" fill="${p.dark}" />
        <rect x="9" y="25" width="3" height="2" fill="${p.main}" />
      </g>
    `;
  }

  if (feetMat) {
    const p = ARMOR_PALETTES[feetMat] || ARMOR_PALETTES.iron;
    layers += `
      <!-- Boots Armor (${feetMat}) -->
      <g id="armor-feet" data-material="${feetMat}">
        <rect x="3" y="27" width="5" height="1" fill="${p.light}" />
        <rect x="4" y="28" width="4" height="4" fill="${p.main}" />
        <rect x="3" y="30" width="5" height="2" fill="${p.dark}" />

        <rect x="8" y="27" width="5" height="1" fill="${p.main}" />
        <rect x="8" y="28" width="4" height="4" fill="${p.dark}" />
        <rect x="8" y="30" width="5" height="2" fill="${p.accent}" />
      </g>
    `;
  }

  return `<svg class="player-doll-svg" viewBox="0 0 16 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${layers}</svg>`;
}

export function renderPlayerDoll(container, armor) {
  if (!container) return;
  container.innerHTML = renderPlayerDollSVG(armor);
}

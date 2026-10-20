import fs from 'fs';

let content = fs.readFileSync('src/extraContent.js', 'utf8');

const doorTypes = [
  { id: 805, key: 'spruce' },
  { id: 809, key: 'birch' },
  { id: 813, key: 'jungle' },
  { id: 817, key: 'acacia' },
  { id: 821, key: 'cherry' },
  { id: 825, key: 'dark_oak' },
  { id: 829, key: 'pale_oak' },
  { id: 833, key: 'mangrove' },
  { id: 837, key: 'bamboo' },
  { id: 845, key: 'crimson' },
  { id: 849, key: 'warped' },
  { id: 853, key: 'copper' },
  { id: 857, key: 'exposed_copper' },
  { id: 861, key: 'oxidized_copper' },
  { id: 865, key: 'weathered_copper' },
  { id: 869, key: 'waxed_copper' },
  { id: 873, key: 'waxed_exposed_copper' },
  { id: 877, key: 'waxed_oxidized_copper' },
  { id: 881, key: 'waxed_weathered_copper' }
];

for (const { id, key } of doorTypes) {
  const baseKey = key.startsWith('waxed_') ? key.replace('waxed_', '') : key;
  const bottomTex = `${baseKey}_door_bottom.png`;
  const topTex = `${baseKey}_door_top.png`;
  const itemIcon = `/assets/items/${key}_door.png`;
  const dropItem = `${key}_door`;

  for (let offset = 0; offset < 4; offset++) {
    const curId = id + offset;
    const regex = new RegExp(`^(\\s*)${curId}:\\s*\\{([^\\n\\r]+)\\}(,?\\r?)$`, 'm');
    const m = content.match(regex);
    if (!m) {
      console.warn(`Could not find door ID ${curId}`);
      continue;
    }
    const indent = m[1];
    let defBody = m[2];
    const ending = m[3];

    // Replace textures
    defBody = defBody.replace(/textures:\s*\{[^\}]+\}/, `textures: { bottom: '${bottomTex}', top: '${topTex}', all: '${bottomTex}' }`);
    
    // Replace or add icon
    if (defBody.includes('icon:')) {
      defBody = defBody.replace(/icon:\s*'[^']+'/, `icon: '${itemIcon}'`);
    } else {
      defBody += `, icon: '${itemIcon}'`;
    }

    // Replace or add dropItem
    if (defBody.includes('dropItem:')) {
      defBody = defBody.replace(/dropItem:\s*'[^']+'/, `dropItem: '${dropItem}'`);
    } else {
      defBody += `, dropItem: '${dropItem}'`;
    }

    if (offset > 0 && !defBody.includes('drop:')) {
      defBody += `, drop: ${id}`;
    }

    content = content.replace(regex, `${indent}${curId}: {${defBody}}${ending}`);
  }
}

const trapdoorTypes = [
  { id: 787, key: 'spruce' },
  { id: 789, key: 'birch' },
  { id: 791, key: 'jungle' },
  { id: 793, key: 'acacia' },
  { id: 795, key: 'cherry' },
  { id: 797, key: 'dark_oak' },
  { id: 799, key: 'pale_oak' },
  { id: 801, key: 'mangrove' },
  { id: 803, key: 'bamboo' },
  { id: 841, key: 'crimson' },
  { id: 843, key: 'warped' },
  { id: 885, key: 'copper' },
  { id: 887, key: 'exposed_copper' },
  { id: 889, key: 'oxidized_copper' },
  { id: 891, key: 'weathered_copper' },
  { id: 893, key: 'waxed_copper' },
  { id: 895, key: 'waxed_exposed_copper' },
  { id: 897, key: 'waxed_oxidized_copper' },
  { id: 899, key: 'waxed_weathered_copper' }
];

for (const { id, key } of trapdoorTypes) {
  const baseKey = key.startsWith('waxed_') ? key.replace('waxed_', '') : key;
  const tex = `${baseKey}_trapdoor.png`;
  const itemIcon = `/assets/items/${key}_trapdoor.png`;
  const dropItem = `${key}_trapdoor`;

  for (let offset = 0; offset < 2; offset++) {
    const curId = id + offset;
    const regex = new RegExp(`^(\\s*)${curId}:\\s*\\{([^\\n\\r]+)\\}(,?\\r?)$`, 'm');
    const m = content.match(regex);
    if (!m) {
      console.warn(`Could not find trapdoor ID ${curId}`);
      continue;
    }
    const indent = m[1];
    let defBody = m[2];
    const ending = m[3];

    defBody = defBody.replace(/textures:\s*\{[^\}]+\}/, `textures: { all: '${tex}' }`);
    
    if (defBody.includes('icon:')) {
      defBody = defBody.replace(/icon:\s*'[^']+'/, `icon: '${itemIcon}'`);
    } else {
      defBody += `, icon: '${itemIcon}'`;
    }

    if (defBody.includes('dropItem:')) {
      defBody = defBody.replace(/dropItem:\s*'[^']+'/, `dropItem: '${dropItem}'`);
    } else {
      defBody += `, dropItem: '${dropItem}'`;
    }

    if (offset > 0 && !defBody.includes('drop:')) {
      defBody += `, drop: ${id}`;
    }

    content = content.replace(regex, `${indent}${curId}: {${defBody}}${ending}`);
  }
}

fs.writeFileSync('src/extraContent.js', content, 'utf8');
console.log('Successfully updated door and trapdoor definitions in src/extraContent.js!');

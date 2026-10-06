import { aquariumStructure } from './aquarium.js';
import { stairsStructure } from './stairs.js';
import { skyscraperStructure } from './skyscraper.js';
import { pyramidStructure } from './pyramid.js';
import { castleStructure } from './castle.js';
import { cozyHouseStructure } from './cozy_house.js';
import { watchtowerStructure } from './watchtower.js';
import { greenhouseStructure } from './greenhouse.js';
import { spaceshipStructure } from './spaceship.js';

export const BUILTIN_STRUCTURES = [
  aquariumStructure,
  stairsStructure,
  skyscraperStructure,
  pyramidStructure,
  castleStructure,
  cozyHouseStructure,
  watchtowerStructure,
  greenhouseStructure,
  spaceshipStructure
].map(s => {
  s.isBuiltin = true;
  return s;
});

export const BUILTIN_STRUCTURES_MAP = new Map(
  BUILTIN_STRUCTURES.map(s => [s.id, s])
);

export {
  aquariumStructure,
  stairsStructure,
  skyscraperStructure,
  pyramidStructure,
  castleStructure,
  cozyHouseStructure,
  watchtowerStructure,
  greenhouseStructure,
  spaceshipStructure
};

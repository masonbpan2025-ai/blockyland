import { aquariumBuilding } from './aquarium.js';
import { stairsBuilding } from './stairs.js';
import { skyscraperBuilding } from './skyscraper.js';
import { pyramidBuilding } from './pyramid.js';
import { castleBuilding } from './castle.js';
import { cozyHouseBuilding } from './cozy_house.js';
import { watchtowerBuilding } from './watchtower.js';
import { greenhouseBuilding } from './greenhouse.js';
import { spaceshipBuilding } from './spaceship.js';

export const BUILTIN_BUILDINGS = [
  aquariumBuilding,
  stairsBuilding,
  skyscraperBuilding,
  pyramidBuilding,
  castleBuilding,
  cozyHouseBuilding,
  watchtowerBuilding,
  greenhouseBuilding,
  spaceshipBuilding
].map(s => {
  s.isBuiltin = true;
  return s;
});

export const BUILTIN_BUILDINGS_MAP = new Map(
  BUILTIN_BUILDINGS.map(s => [s.id, s])
);

export {
  aquariumBuilding,
  stairsBuilding,
  skyscraperBuilding,
  pyramidBuilding,
  castleBuilding,
  cozyHouseBuilding,
  watchtowerBuilding,
  greenhouseBuilding,
  spaceshipBuilding
};

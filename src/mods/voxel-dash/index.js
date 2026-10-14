import { createDashView } from './client/view.js';
export function register(api) {
  api.registerMap('biomes', { filename: 'Voxel_Dash.json' });
  api.registerGame({ name: 'Voxel Dash', createView: api => createDashView(api) });
}

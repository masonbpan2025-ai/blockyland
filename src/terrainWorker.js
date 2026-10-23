// The terrain worker: generates chunks off the main thread (see terrainService.js and terrainWorkerClient.js).
import { createTerrainService } from './terrainService.js';

const service = createTerrainService();

self.onmessage = (event) => {
  const { reply, transfer } = service.handle(event.data);
  self.postMessage(reply, transfer ?? []);
};

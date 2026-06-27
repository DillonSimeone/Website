import { computeSloganPlacements } from "./slogan-placements.js";

self.onmessage = (event) => {
  const placements = computeSloganPlacements(event.data);
  self.postMessage({ placements });
};

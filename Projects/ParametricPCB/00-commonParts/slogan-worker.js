import { computeSloganPlacements } from "./slogan-placements.js";

self.onmessage = (event) => {
  const result = computeSloganPlacements(event.data);
  self.postMessage(result);
};

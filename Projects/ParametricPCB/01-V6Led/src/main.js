import { React, ReactDOMClient } from "../../00-commonParts/tscircuit-core.js";
const { createRoot } = ReactDOMClient;
import { PCBStudioApp } from "./ui.js";

// Mount the React application to the DOM
const container = document.getElementById("app-root");
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(PCBStudioApp));
} else {
  console.error("Target container #app-root not found.");
}

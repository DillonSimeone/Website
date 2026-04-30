# The Optimizer: Generation Trace

An interactive webapp featuring a high-performance visual engine and responsive narrative storytelling. Built with Vite and native Canvas API.

### 🌐 Development Server
To start the project locally for development:
```bash
cd webapp
npm run dev
```
The server will be available at [http://localhost:3000/](http://localhost:3000/).

### 📦 Build & Optimization
To bundle the project into a compressed, production-ready format (outputs to `/dist`):
```bash
cd webapp
npm run build
```

### 🔍 Preview Build
To test the production build locally before deployment:
```bash
cd webapp
npm run preview
```

### 🛠️ Story Structure
- **`webapp/index.html`**: The main story entry.
- **`webapp/index2.html`**: The polished, expanded narrative version.
- **`webapp/phases/`**: Modular JavaScript logic for each story state.
- **`Narrative/`**: Clean markdown source for the story text.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3460;
const ROOT_DIR = path.resolve(__dirname, '..');
const ENTITIES_DIR = path.join(ROOT_DIR, 'entities');

if (!fs.existsSync(ENTITIES_DIR)) {
  fs.mkdirSync(ENTITIES_DIR, { recursive: true });
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(ROOT_DIR));

function sanitizeId(raw) {
  return String(raw || 'custom_entity')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'custom_entity';
}

function rebuildManifest() {
  const files = fs.readdirSync(ENTITIES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json')
    .map(f => f.replace(/\.json$/, ''));
  fs.writeFileSync(path.join(ENTITIES_DIR, 'manifest.json'), JSON.stringify(files, null, 2));
  return files;
}

app.get('/api/entities', (_req, res) => {
  try {
    const ids = rebuildManifest();
    const entities = ids.map(id => {
      const raw = fs.readFileSync(path.join(ENTITIES_DIR, `${id}.json`), 'utf8');
      return JSON.parse(raw);
    });
    res.json({ entities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entities', (req, res) => {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.nodes) || body.nodes.length === 0) {
      return res.status(400).json({ error: 'Entity must contain at least one node.' });
    }
    const id = sanitizeId(body.id || body.name);
    const payload = {
      id,
      name: String(body.name || id).trim(),
      isBoss: Boolean(body.isBoss),
      nodes: body.nodes
    };
    fs.writeFileSync(path.join(ENTITIES_DIR, `${id}.json`), JSON.stringify(payload, null, 2));
    const manifest = rebuildManifest();
    res.json({ ok: true, id, manifest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/entities/:id', (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const target = path.join(ENTITIES_DIR, `${id}.json`);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    const manifest = rebuildManifest();
    res.json({ ok: true, manifest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[ENTITY FORGE] Express server running at http://localhost:${PORT}/entity-forge.html`);
  console.log(`[ENTITY FORGE] Saving entity JSONs to ${ENTITIES_DIR}`);
});

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3737;

app.use(express.static(__dirname, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ⬢  Library of Babel — serving on http://127.0.0.1:${PORT}/\n`);
  console.log(`     Press Ctrl+C to stop.\n`);
});

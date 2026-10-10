/**
 * MYT Video Capture Hub - Automated 5-Second Slice Merger & Markdown Logger
 *
 * Scans directories (default: storage/recordings) recursively for discrete 5-second video slices
 * (.webm, .mp4), groups them into takes by hole/device/sequence, merges them losslessly via FFmpeg
 * (or fallback stream concatenation), updates takes in session_meta.json, and documents the
 * merged status in a comprehensive `merged.md` in each folder.
 *
 * Usage:
 *   node scripts/merge_slices.js [target_directory] [--force]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_STORAGE = path.join(PROJECT_ROOT, 'storage', 'recordings');

// Detect arguments
const args = process.argv.slice(2);
const forceMerge = args.includes('--force') || args.includes('-f');
const targetArg = args.find(a => !a.startsWith('-'));
const scanRoot = targetArg ? path.resolve(process.cwd(), targetArg) : DEFAULT_STORAGE;

// Helper: Check if FFmpeg is available
function getFfmpegBin() {
  const candidates = [
    'ffmpeg',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe'
  ];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" -version`, { stdio: 'ignore' });
      return bin;
    } catch (e) {}
  }
  return null;
}

const FFMPEG_BIN = getFfmpegBin();

// Format bytes into human-readable string
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// Find all directories that directly contain video slices
function findSliceDirs(currentDir, results = new Set()) {
  if (!fs.existsSync(currentDir)) return results;

  let entries = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (e) {
    return results;
  }

  let hasSlices = false;
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      findSliceDirs(path.join(currentDir, ent.name), results);
    } else if (ent.isFile()) {
      const lower = ent.name.toLowerCase();
      if ((lower.endsWith('.webm') || lower.endsWith('.mp4')) && (lower.startsWith('slice_') || lower.includes('_slice_'))) {
        hasSlices = true;
      }
    }
  }

  if (hasSlices) {
    results.add(currentDir);
  }

  return results;
}

// Parse slice metadata from filename
// Pattern: slice_0001_H1_2026-09-25T10-40-00-000Z_Windows_Chrome.webm
function parseSliceFilename(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const base = path.basename(filename, path.extname(filename));

  const standardMatch = base.match(/^slice_(\d+)_(H\d+|[A-Za-z0-9]+)_([^_]+(?:_[^_]+)*?)_([A-Za-z0-9]+)_([A-Za-z0-9]+)$/i);
  if (standardMatch) {
    return {
      filename,
      ext,
      index: parseInt(standardMatch[1], 10),
      hole: standardMatch[2],
      timestampIso: standardMatch[3],
      os: standardMatch[4],
      browser: standardMatch[5],
      groupKey: `${standardMatch[2]}_${standardMatch[4]}_${standardMatch[5]}.${ext}`
    };
  }

  // Relaxed fallback match
  const relaxedMatch = base.match(/^slice_(\d+)_(.+)$/i);
  if (relaxedMatch) {
    return {
      filename,
      ext,
      index: parseInt(relaxedMatch[1], 10),
      hole: 'Take',
      timestampIso: 'Unknown',
      os: 'Device',
      browser: 'Browser',
      groupKey: `${relaxedMatch[2]}.${ext}`
    };
  }

  // Generic fallback
  return {
    filename,
    ext,
    index: 1,
    hole: 'Take',
    timestampIso: 'Unknown',
    os: 'Device',
    browser: 'Browser',
    groupKey: `take.${ext}`
  };
}

// Group slices in a folder into distinct takes (splitting if sequence resets or time gaps occur)
function groupSlicesIntoTakes(folder) {
  const files = fs.readdirSync(folder).filter(f => {
    const l = f.toLowerCase();
    return (l.endsWith('.webm') || l.endsWith('.mp4')) && (l.startsWith('slice_') || l.includes('_slice_'));
  });

  const parsed = files.map(f => {
    const stats = fs.statSync(path.join(folder, f));
    return { ...parseSliceFilename(f), size: stats.size, mtimeMs: stats.mtimeMs };
  });

  // Group by basic groupKey
  const byGroup = new Map();
  for (const item of parsed) {
    if (!byGroup.has(item.groupKey)) byGroup.set(item.groupKey, []);
    byGroup.get(item.groupKey).push(item);
  }

  const takes = [];

  for (const [groupKey, items] of byGroup.entries()) {
    // Sort items primarily by index, then by mtime
    items.sort((a, b) => (a.index - b.index) || (a.mtimeMs - b.mtimeMs));

    // Partition if index resets to 1 (indicating separate recording runs)
    let currentTake = [];
    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      if (currentTake.length > 0 && cur.index === 1) {
        takes.push({ ...currentTake[0], slices: currentTake });
        currentTake = [];
      }
      currentTake.push(cur);
    }
    if (currentTake.length > 0) {
      takes.push({ ...currentTake[0], slices: currentTake });
    }
  }

  return takes;
}

// Perform merge for a take
function mergeTake(folder, take, sessionTakesDir) {
  const { ext, hole, os: osName, browser: browserName, slices } = take;
  const rawDir = folder;
  const isInsideRaw = path.basename(folder).toLowerCase() === 'raw';
  const takesDir = isInsideRaw ? sessionTakesDir : path.join(folder, 'takes');

  if (!fs.existsSync(takesDir)) {
    fs.mkdirSync(takesDir, { recursive: true });
  }

  // Derive target take filename
  const firstSlice = slices[0];
  const timeSuffix = firstSlice.timestampIso && firstSlice.timestampIso !== 'Unknown'
    ? `_${firstSlice.timestampIso.replace(/[:.]/g, '-')}`
    : '';

  // Standard take name
  const takeFilename = `take_${hole}_${osName}_${browserName}${timeSuffix}.${ext}`;
  const takePath = path.join(takesDir, takeFilename);

  // Check if output already exists and has valid size
  let alreadyMerged = false;
  if (!forceMerge && fs.existsSync(takePath)) {
    const existingStat = fs.statSync(takePath);
    if (existingStat.size > 0) {
      alreadyMerged = true;
    }
  }

  let mergeMethod = 'FFmpeg Concat Demuxer (Lossless Stream-Copy)';
  let errorMsg = null;

  if (!alreadyMerged) {
    if (FFMPEG_BIN) {
      // Concat list file
      const concatListPath = path.join(takesDir, `_temp_concat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}.txt`);
      try {
        const lines = slices.map(s => {
          const filePath = path.join(rawDir, s.filename).replace(/\\/g, '/');
          // Escape single quotes for ffmpeg concat demuxer: ' -> '\''
          const escaped = filePath.replace(/'/g, "'\\''");
          return `file '${escaped}'`;
        });
        fs.writeFileSync(concatListPath, lines.join('\n'), 'utf-8');

        if (ext === 'mp4') {
          // MP4 remux with faststart
          const cmd = `"${FFMPEG_BIN}" -y -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart "${takePath}"`;
          execSync(cmd, { stdio: 'pipe' });
        } else {
          // WebM stream copy
          const cmd = `"${FFMPEG_BIN}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${takePath}"`;
          execSync(cmd, { stdio: 'pipe' });
        }
      } catch (err) {
        // Fallback to binary byte concat
        mergeMethod = 'Binary Concatenation Fallback (FFmpeg Error)';
        errorMsg = err.stderr ? err.stderr.toString() : err.message;
        try {
          fs.writeFileSync(takePath, Buffer.alloc(0));
          for (const s of slices) {
            fs.appendFileSync(takePath, fs.readFileSync(path.join(rawDir, s.filename)));
          }
        } catch (binErr) {
          errorMsg = binErr.message;
        }
      } finally {
        try { if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath); } catch (e) {}
      }
    } else {
      // FFmpeg not available: direct binary concat
      mergeMethod = 'Direct Binary Concatenation (FFmpeg Not Installed)';
      try {
        fs.writeFileSync(takePath, Buffer.alloc(0));
        for (const s of slices) {
          fs.appendFileSync(takePath, fs.readFileSync(path.join(rawDir, s.filename)));
        }
      } catch (binErr) {
        errorMsg = binErr.message;
      }
    }
  }

  // Stat output
  let outputSize = 0;
  if (fs.existsSync(takePath)) {
    outputSize = fs.statSync(takePath).size;
  }

  return {
    takeFilename,
    takePath,
    relativeTakePath: path.relative(folder, takePath).replace(/\\/g, '/'),
    hole,
    osName,
    browserName,
    ext,
    slicesCount: slices.length,
    slices,
    outputSize,
    durationSec: slices.length * 5.0,
    mergeMethod,
    alreadyMerged,
    errorMsg,
    mergedAt: new Date().toISOString()
  };
}

// Generate or update merged.md in the folder
function updateMergedMarkdown(folder, mergeResults, sessionDir) {
  const mdPath = path.join(folder, 'merged.md');
  const now = new Date().toISOString();

  let totalSlices = 0;
  let totalBytes = 0;
  mergeResults.forEach(r => {
    totalSlices += r.slicesCount;
    totalBytes += r.outputSize;
  });

  const lines = [
    `# Video Slices Merge Manifest`,
    ``,
    `*Generated automatically by MYT Slice Merger Engine*  `,
    `**Last Run:** \`${now}\`  `,
    `**Folder:** \`${path.resolve(folder)}\`  `,
    `**Total Merged Takes:** ${mergeResults.length}  `,
    `**Total Slices Combined:** ${totalSlices} (5-second intervals)  `,
    `**Total Video Size:** ${formatBytes(totalBytes)}  `,
    ``,
    `---`,
    ``,
    `## Summary of Takes`,
    ``,
    `| Output Video | Hole | Device / Browser | Slices | Est. Duration | Size | Merge Method | Status |`,
    `|---|---|---|:---:|:---:|:---:|---|:---:|`
  ];

  for (const r of mergeResults) {
    const statusBadge = r.errorMsg
      ? `❌ Error`
      : r.alreadyMerged
        ? `✅ Already Merged`
        : `✅ Merged (New)`;
    lines.push(
      `| [\`${r.takeFilename}\`](${r.relativeTakePath}) | **${r.hole}** | ${r.osName} (${r.browserName}) | ${r.slicesCount} | ~${r.durationSec.toFixed(1)}s | ${formatBytes(r.outputSize)} | ${r.mergeMethod} | ${statusBadge} |`
    );
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Detailed Slice Composition by Take`);
  lines.push(``);

  for (const r of mergeResults) {
    lines.push(`### Take: \`${r.takeFilename}\``);
    lines.push(`- **Output Location:** \`${r.takePath}\``);
    lines.push(`- **Hole:** \`${r.hole}\``);
    lines.push(`- **Client:** ${r.osName} / ${r.browserName}`);
    lines.push(`- **Total Slices:** ${r.slicesCount} (${formatBytes(r.outputSize)})`);
    lines.push(`- **Merge Protocol:** ${r.mergeMethod}`);
    lines.push(`- **Processed At:** ${r.mergedAt}`);
    if (r.errorMsg) {
      lines.push(`- **⚠️ Warning / Error:** \`${r.errorMsg}\``);
    }
    lines.push(``);
    lines.push(`#### Slices Included:`);
    lines.push(`| # | Filename | Size | Status |`);
    lines.push(`|:---:|---|:---:|:---:|`);

    r.slices.forEach((s, idx) => {
      lines.push(`| ${idx + 1} | \`${s.filename}\` | ${formatBytes(s.size)} | [x] Merged into take |`);
    });

    lines.push(``);
  }

  fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');
  console.log(`  ✓ Updated manifest: ${mdPath}`);

  // If this was in raw/, also write/link to the parent session folder
  if (sessionDir && sessionDir !== folder) {
    const parentMdPath = path.join(sessionDir, 'merged.md');
    try {
      fs.writeFileSync(parentMdPath, lines.join('\n'), 'utf-8');
      console.log(`  ✓ Updated session manifest: ${parentMdPath}`);
    } catch (e) {}
  }
}

// Update session_meta.json with merged take information so Smart Sync Studio detects them
function updateSessionMeta(sessionDir, mergeResults) {
  const metaPath = path.join(sessionDir, 'session_meta.json');
  if (!fs.existsSync(metaPath)) return;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.takes = meta.takes || [];

    for (const r of mergeResults) {
      if (r.errorMsg) continue;
      const firstSlice = meta.clips?.find(c => c.filename === r.slices[0]?.filename);
      const lastSlice = meta.clips?.find(c => c.filename === r.slices[r.slices.length - 1]?.filename);

      const takeEntry = {
        filename: r.takeFilename,
        hole: r.hole,
        os: r.osName,
        browser: r.browserName,
        startEpoch: firstSlice ? firstSlice.startEpoch : (Date.now() - r.durationSec * 1000),
        endEpoch: lastSlice ? lastSlice.endEpoch : Date.now(),
        durationSec: r.durationSec,
        slicesCount: r.slicesCount,
        bytes: r.outputSize,
        url: `/storage/recordings/${meta.player_name || 'player'}/${meta.date || 'date'}/session_${meta.session_uuid || '1'}/takes/${encodeURIComponent(r.takeFilename)}`,
        isTake: true,
        mergedAt: Date.now()
      };

      const existingIdx = meta.takes.findIndex(t => t.filename === r.takeFilename);
      if (existingIdx >= 0) {
        meta.takes[existingIdx] = takeEntry;
      } else {
        meta.takes.push(takeEntry);
      }
    }

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`  ✓ Synced ${mergeResults.length} takes with session_meta.json`);
  } catch (err) {
    console.warn(`  ⚠️ Could not update session_meta.json: ${err.message}`);
  }
}

// Main execution routine
function run() {
  console.log('======================================================');
  console.log(' 🎬 MYT Video Capture Hub: 5-Second Slice Merger     ');
  console.log('======================================================');
  console.log(`Scan Target: ${scanRoot}`);
  console.log(`FFmpeg     : ${FFMPEG_BIN ? `${FFMPEG_BIN} (Lossless Stream-Copy Enabled)` : 'Not Found (Using Fast Binary Concat)'}`);
  console.log(`Mode       : ${forceMerge ? 'Force Re-merge All' : 'Incremental (Skip Unchanged)'}`);
  console.log('------------------------------------------------------');

  if (!fs.existsSync(scanRoot)) {
    console.log(`Notice: Target directory "${scanRoot}" does not exist yet.`);
    console.log('Storage directories are created automatically when players start filming.');
    return;
  }

  const sliceDirs = Array.from(findSliceDirs(scanRoot));

  if (sliceDirs.length === 0) {
    console.log(`No slice files found in "${scanRoot}".`);
    console.log('Slices are generated automatically every 5 seconds during active recording.');
    return;
  }

  console.log(`Found ${sliceDirs.length} folder(s) containing video slices:\n`);

  let totalProcessedTakes = 0;

  for (const dir of sliceDirs) {
    console.log(`📁 Processing: ${dir}`);
    const takes = groupSlicesIntoTakes(dir);

    if (takes.length === 0) {
      console.log('  No groupable slices found.');
      continue;
    }

    const isInsideRaw = path.basename(dir).toLowerCase() === 'raw';
    const sessionDir = isInsideRaw ? path.dirname(dir) : dir;
    const sessionTakesDir = path.join(sessionDir, 'takes');

    const results = [];
    for (const take of takes) {
      console.log(`  ► Group: Hole ${take.hole} | ${take.os} (${take.browser}) | ${take.slices.length} slices`);
      const res = mergeTake(dir, take, sessionTakesDir);
      results.push(res);
      totalProcessedTakes++;
      if (res.alreadyMerged) {
        console.log(`    ↳ Skipped: ${res.takeFilename} (already merged, ${formatBytes(res.outputSize)})`);
      } else if (res.errorMsg) {
        console.error(`    ↳ ⚠️ Error: ${res.errorMsg}`);
      } else {
        console.log(`    ↳ ✓ Stitched: ${res.takeFilename} (${formatBytes(res.outputSize)}) via ${res.mergeMethod}`);
      }
    }

    updateMergedMarkdown(dir, results, sessionDir);
    updateSessionMeta(sessionDir, results);
    console.log('');
  }

  console.log('======================================================');
  console.log(`✓ Completed slice merge routine across all folders.`);
  console.log(`  Total Takes Processed: ${totalProcessedTakes}`);
  console.log('======================================================\n');
}

run();

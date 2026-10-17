import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PASSWORD = 'shrek';
const VAULT_FILE = path.join(__dirname, '_source_vault.enc');
const CATALOG_FILE = path.join(__dirname, 'catalog.enc');

// Files to process
const ROOT_DOCS = [
    { file: 'CURRICULUM_MAP.md', num: '00', label: 'Curriculum Map', group: 'Foundational Framework' },
    { file: 'RESEARCH_AUDIT.md', num: '00', label: 'Research Audit', group: 'Foundational Framework' },
    { file: 'GRANT_ALIGNMENT.md', num: '00', label: 'NEA Grant Alignment', group: 'Foundational Framework' },
    { file: 'TECHNICAL_SPEC.md', num: '00', label: 'Technical Specifications', group: 'Foundational Framework' }
];

const LESSON_PLANS = [
    { file: 'LESSON_PLANS/LP-01_Heartbeat_and_Pulse.md', num: '01', label: 'Heartbeat & Pulse', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-02_Sounds_and_Shapes.md', num: '02', label: 'Sounds & Shapes', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-03_Color_of_the_Sound.md', num: '03', label: 'Color of the Sound', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-04_Stem_to_Body_Mapping.md', num: '04', label: 'Stem-to-Body Mapping', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-05_Graphic_Composition_Studio.md', num: '05', label: 'Graphic Composition', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-06_Visual_Vernacular_Pulse_Piece.md', num: '06', label: 'Visual Vernacular Pulse', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-07_Sign_to_Beat_I.md', num: '07', label: 'Sign-to-Beat I', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-08_Motion_to_Synth.md', num: '08', label: 'Motion-to-Synth', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-09_Euclidean_Rhythm_Circle.md', num: '09', label: 'Euclidean Rhythm Circle', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-10_Firmware_Hack.md', num: '10', label: 'Firmware Hack', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-11_CV_Pipeline.md', num: '11', label: 'CV Pipeline Training', group: 'K-12 Syllabus Lesson Plans' },
    { file: 'LESSON_PLANS/LP-12_Capstone_Composition.md', num: '12', label: 'Capstone Composition', group: 'K-12 Syllabus Lesson Plans' }
];

const OTHER_FILES = [
    'LESSON_PLANS/README.md',
    'README.md',
    '_extracted/cyberdeck_app.txt',
    '_extracted/gestolumina.txt',
    '_extracted/nea_app.txt',
    '_extracted/sonic_agency.txt'
];

// Helper: Encrypt plaintext string with AES-256-GCM via Web Crypto
async function encryptText(plaintext, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );

    const cipherBytes = new Uint8Array(cipherBuffer);
    const combined = new Uint8Array(salt.length + iv.length + cipherBytes.length);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(cipherBytes, 28);

    return Buffer.from(combined).toString('base64');
}

// Helper: Decrypt base64 string with AES-256-GCM via Web Crypto
async function decryptText(base64Str, password) {
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    const combined = Buffer.from(base64Str, 'base64');

    const salt = combined.subarray(0, 16);
    const iv = combined.subarray(16, 28);
    const ciphertext = combined.subarray(28);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    return dec.decode(decryptedBuffer);
}

// Check if a file content looks encrypted
function isEncryptedContent(content) {
    return content.startsWith('---ENCRYPTED-FILE---') || content.startsWith('---ENCRYPTED-PAYLOAD---');
}

async function doEncrypt(password) {
    console.log(`\n🔒 Encrypting TestSchooling contents with password: "${password}"...`);

    const sourceVault = {};
    const frameworkItems = [];
    const lessonItems = [];

    // Verify plaintext status
    for (const doc of ROOT_DOCS) {
        const filePath = path.join(__dirname, doc.file);
        if (!fs.existsSync(filePath)) continue;
        const text = fs.readFileSync(filePath, 'utf8');
        if (isEncryptedContent(text)) {
            console.log(`⚠️ Files appear to be already encrypted! Run "node crypto-tool.mjs decrypt" first if you need to edit.`);
            return;
        }
        sourceVault[doc.file] = text;
        frameworkItems.push({
            file: doc.file,
            num: doc.num,
            label: doc.label,
            content: text
        });
    }

    for (const doc of LESSON_PLANS) {
        const filePath = path.join(__dirname, doc.file);
        if (!fs.existsSync(filePath)) continue;
        const text = fs.readFileSync(filePath, 'utf8');
        if (isEncryptedContent(text)) {
            console.log(`⚠️ Files appear to be already encrypted! Run "node crypto-tool.mjs decrypt" first if you need to edit.`);
            return;
        }
        sourceVault[doc.file] = text;
        lessonItems.push({
            file: doc.file,
            num: doc.num,
            label: doc.label,
            content: text
        });
    }

    for (const relPath of OTHER_FILES) {
        const filePath = path.join(__dirname, relPath);
        if (fs.existsSync(filePath)) {
            const text = fs.readFileSync(filePath, 'utf8');
            sourceVault[relPath] = text;
        }
    }

    // Build catalog payload
    const catalogData = {
        title: 'Sonic Agency — K-12 Deaf Haptic STEAM Curriculum',
        orgBadge: 'CymaSpace Research',
        mainTitle: 'SONIC AGENCY',
        subtitle: 'STEAM Curriculum Catalog',
        groups: [
            {
                name: 'Foundational Framework',
                items: frameworkItems
            },
            {
                name: 'K-12 Syllabus Lesson Plans',
                items: lessonItems
            }
        ]
    };

    // Encrypt web catalog to catalog.enc
    console.log('Writing encrypted web catalog (catalog.enc)...');
    const catalogEncrypted = await encryptText(JSON.stringify(catalogData), password);
    fs.writeFileSync(CATALOG_FILE, catalogEncrypted, 'utf8');
    console.log(`✓ catalog.enc generated (${catalogEncrypted.length} bytes)`);

    // Save full source vault backup (all raw files)
    console.log('Writing encrypted master backup vault (_source_vault.enc)...');
    const vaultEncrypted = await encryptText(JSON.stringify(sourceVault), password);
    fs.writeFileSync(VAULT_FILE, vaultEncrypted, 'utf8');
    console.log(`✓ _source_vault.enc generated (${vaultEncrypted.length} bytes)`);

    // Replace plain text files on disk with encrypted ciphertext
    console.log('Encrypting individual files on disk so web spiders see no plaintext...');
    for (const [relPath, plainText] of Object.entries(sourceVault)) {
        const fullPath = path.join(__dirname, relPath);
        const encryptedFileBody = await encryptText(plainText, password);
        const placeholder = `---ENCRYPTED-FILE---
# Protected Content
This document is encrypted for confidentiality.
To view this document, use the web viewer with access credentials or run:
node crypto-tool.mjs decrypt

[CIPHERTEXT]
${encryptedFileBody}
---END-ENCRYPTED-FILE---`;

        fs.writeFileSync(fullPath, placeholder, 'utf8');
        console.log(`  ✓ Encrypted: ${relPath}`);
    }

    console.log('\n🎉 Encryption complete! All contents are encrypted and hidden from spiders.');
}

async function doDecrypt(password) {
    console.log(`\n🔓 Decrypting TestSchooling contents with password: "${password}"...`);

    if (!fs.existsSync(VAULT_FILE)) {
        console.error('Error: _source_vault.enc not found. Cannot restore files.');
        return;
    }

    const encryptedVault = fs.readFileSync(VAULT_FILE, 'utf8');
    let sourceVault;
    try {
        const decryptedJson = await decryptText(encryptedVault, password);
        sourceVault = JSON.parse(decryptedJson);
    } catch (err) {
        console.error('❌ Decryption failed! Incorrect password or corrupted vault file.');
        return;
    }

    for (const [relPath, plainText] of Object.entries(sourceVault)) {
        const fullPath = path.join(__dirname, relPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, plainText, 'utf8');
        console.log(`  ✓ Restored plaintext: ${relPath}`);
    }

    console.log('\n🎉 Decryption complete! All source documents restored to plain text.');
}

async function doStatus() {
    console.log('\n🔍 Checking encryption status...');
    const testFile = path.join(__dirname, 'CURRICULUM_MAP.md');
    if (!fs.existsSync(testFile)) {
        console.log('CURRICULUM_MAP.md not found.');
        return;
    }
    const content = fs.readFileSync(testFile, 'utf8');
    if (isEncryptedContent(content)) {
        console.log('Status: 🔒 ENCRYPTED (Spiders cannot read contents)');
    } else {
        console.log('Status: 📖 PLAINTEXT (Spiders can read contents)');
    }
    console.log(`Catalog exists: ${fs.existsSync(CATALOG_FILE)}`);
    console.log(`Vault backup exists: ${fs.existsSync(VAULT_FILE)}`);
}

// CLI handler
const mode = (process.argv[2] || 'status').toLowerCase();
const pass = (process.argv[3] || DEFAULT_PASSWORD).toLowerCase();

if (mode === 'encrypt') {
    await doEncrypt(pass);
} else if (mode === 'decrypt') {
    await doDecrypt(pass);
} else if (mode === 'status') {
    await doStatus();
} else {
    console.log(`
Usage:
  node crypto-tool.mjs encrypt [password]   # Encrypts all markdown/text files and builds catalog.enc (default: shrek)
  node crypto-tool.mjs decrypt [password]   # Restores all plaintext files from encrypted vault (default: shrek)
  node crypto-tool.mjs status               # Shows current encryption status
`);
}

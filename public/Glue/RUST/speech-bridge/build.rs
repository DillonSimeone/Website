//! Pure-Rust build script that generates the cyber-waveform `.ico` and embeds it
//! into the Windows PE `.rsrc` section via a COFF object (no windres/rc.exe needed).

use std::env;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let obj_path = out_dir.join("icon_rsrc.o");

    let sizes = [16u32, 32u32, 48u32];
    let dibs: Vec<Vec<u8>> = sizes.iter().map(|&s| build_icon_dib(s)).collect();
    let grp = build_group_icon(&sizes, &dibs);

    let coff = build_rsrc_coff(&dibs, &grp);
    let mut f = File::create(&obj_path).unwrap();
    f.write_all(&coff).unwrap();

    println!("cargo:rustc-link-arg={}", obj_path.display());
}

fn build_icon_dib(size: u32) -> Vec<u8> {
    let w = size as usize;
    let h = size as usize;
    let cx = (w as f32 - 1.0) * 0.5;
    let cy = (h as f32 - 1.0) * 0.5;
    let half = w as f32 * 0.5;
    let radius = w as f32 * 0.22;
    let bar_heights = [0.28f32, 0.54, 0.78, 0.54, 0.28];

    // 40-byte BITMAPINFOHEADER (height = 2 * h for XOR + AND masks)
    let mut dib = Vec::with_capacity(40 + w * h * 4 + ((w + 31) / 32 * 4) * h);
    dib.extend_from_slice(&40u32.to_le_bytes()); // biSize
    dib.extend_from_slice(&(size as i32).to_le_bytes()); // biWidth
    dib.extend_from_slice(&((size * 2) as i32).to_le_bytes()); // biHeight
    dib.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    dib.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    dib.extend_from_slice(&0u32.to_le_bytes()); // biCompression (BI_RGB)
    dib.extend_from_slice(&((w * h * 4) as u32).to_le_bytes()); // biSizeImage
    dib.extend_from_slice(&0i32.to_le_bytes());
    dib.extend_from_slice(&0i32.to_le_bytes());
    dib.extend_from_slice(&0u32.to_le_bytes());
    dib.extend_from_slice(&0u32.to_le_bytes());

    // Bottom-up BGRA pixels
    for y_rev in 0..h {
        let y = h - 1 - y_rev;
        for x in 0..w {
            let dx = (x as f32 - cx).abs() - (half - radius - 1.0);
            let dy = (y as f32 - cy).abs() - (half - radius - 1.0);
            let ox = dx.max(0.0);
            let oy = dy.max(0.0);
            let dist = (ox * ox + oy * oy).sqrt() + dx.max(dy).min(0.0) - radius;

            if dist > 0.6 {
                dib.extend_from_slice(&[0, 0, 0, 0]);
                continue;
            }
            let alpha = ((0.6 - dist).clamp(0.0, 1.0) * 255.0) as u8;
            let mut b: u8 = 0x0E;
            let mut g: u8 = 0x0A;
            let mut r: u8 = 0x07;

            if dist > -1.6 {
                b = 0x88;
                g = 0xFF;
                r = 0x00;
            } else {
                let nx = x as f32 / w as f32;
                let ny = (y as f32 - cy).abs() / half;
                for (bi, &bh) in bar_heights.iter().enumerate() {
                    let bx = 0.24 + (bi as f32) * 0.13;
                    if (nx - bx).abs() < 0.042 && ny <= bh * 0.72 {
                        if bi == 2 {
                            b = 0xFF;
                            g = 0xD4;
                            r = 0x00;
                        } else {
                            b = 0x88;
                            g = 0xFF;
                            r = 0x00;
                        }
                    }
                }
            }
            dib.extend_from_slice(&[b, g, r, alpha]);
        }
    }

    // 1-bpp AND mask (all 0s since 32-bit alpha channel controls transparency)
    let mask_stride = ((w + 31) / 32) * 4;
    dib.resize(dib.len() + mask_stride * h, 0);
    dib
}

fn build_group_icon(sizes: &[u32], dibs: &[Vec<u8>]) -> Vec<u8> {
    let mut grp = Vec::with_capacity(6 + sizes.len() * 14);
    grp.extend_from_slice(&0u16.to_le_bytes()); // idReserved
    grp.extend_from_slice(&1u16.to_le_bytes()); // idType (1 = icon)
    grp.extend_from_slice(&(sizes.len() as u16).to_le_bytes()); // idCount
    for (i, (&sz, dib)) in sizes.iter().zip(dibs.iter()).enumerate() {
        grp.push(sz as u8); // bWidth
        grp.push(sz as u8); // bHeight
        grp.push(0); // bColorCount
        grp.push(0); // bReserved
        grp.extend_from_slice(&1u16.to_le_bytes()); // wPlanes
        grp.extend_from_slice(&32u16.to_le_bytes()); // wBitCount
        grp.extend_from_slice(&(dib.len() as u32).to_le_bytes()); // dwBytesInRes
        grp.extend_from_slice(&((i + 1) as u16).to_le_bytes()); // nID
    }
    grp
}

fn push_dir(buf: &mut Vec<u8>, entries: &[(u32, u32)]) {
    // IMAGE_RESOURCE_DIRECTORY (16 bytes)
    buf.extend_from_slice(&0u32.to_le_bytes()); // Characteristics
    buf.extend_from_slice(&0u32.to_le_bytes()); // TimeDateStamp
    buf.extend_from_slice(&0u16.to_le_bytes()); // MajorVersion
    buf.extend_from_slice(&0u16.to_le_bytes()); // MinorVersion
    buf.extend_from_slice(&0u16.to_le_bytes()); // NumberOfNamedEntries
    buf.extend_from_slice(&(entries.len() as u16).to_le_bytes()); // NumberOfIdEntries
    for &(id, offset) in entries {
        buf.extend_from_slice(&id.to_le_bytes());
        buf.extend_from_slice(&offset.to_le_bytes());
    }
}

fn build_rsrc_coff(dibs: &[Vec<u8>], grp: &[u8]) -> Vec<u8> {
    let n_icons = dibs.len();
    let mut rsrc = Vec::new();

    // Layout offsets (all sizes are deterministic):
    // Root dir: 16 + 2 * 8 = 32 bytes (at 0)
    // Type RT_ICON (3) dir: 16 + n_icons * 8 (at 32)
    // Type RT_GROUP_ICON (14) dir: 16 + 1 * 8 = 24 bytes
    let off_root = 0u32;
    let off_type_icon = 32u32;
    let off_type_grp = off_type_icon + 16 + (n_icons as u32) * 8;
    let off_lang_dirs = off_type_grp + 24;
    // n_icons + 1 lang dirs, each 16 + 8 = 24 bytes
    let off_data_entries = off_lang_dirs + ((n_icons as u32) + 1) * 24;
    // n_icons + 1 data entries, each 16 bytes
    let mut off_raw = off_data_entries + ((n_icons as u32) + 1) * 16;

    let _ = off_root;
    // Root dir
    push_dir(
        &mut rsrc,
        &[
            (3, 0x8000_0000 | off_type_icon),
            (14, 0x8000_0000 | off_type_grp),
        ],
    );

    // RT_ICON dir
    let mut icon_entries = Vec::with_capacity(n_icons);
    for i in 0..n_icons {
        icon_entries.push(((i + 1) as u32, 0x8000_0000 | (off_lang_dirs + (i as u32) * 24)));
    }
    push_dir(&mut rsrc, &icon_entries);

    // RT_GROUP_ICON dir
    push_dir(
        &mut rsrc,
        &[(1, 0x8000_0000 | (off_lang_dirs + (n_icons as u32) * 24))],
    );

    // Language dirs (0x0409 English US)
    for i in 0..=n_icons {
        push_dir(
            &mut rsrc,
            &[(0x0409, off_data_entries + (i as u32) * 16)],
        );
    }

    // Data entries + record relocation offsets for OffsetToData
    let mut reloc_offsets = Vec::with_capacity(n_icons + 1);
    let mut raw_blocks: Vec<&[u8]> = Vec::with_capacity(n_icons + 1);
    for dib in dibs {
        raw_blocks.push(dib);
    }
    raw_blocks.push(grp);

    for block in &raw_blocks {
        // Align raw data to 4 bytes
        while off_raw % 4 != 0 {
            off_raw += 1;
        }
        reloc_offsets.push(rsrc.len() as u32);
        rsrc.extend_from_slice(&off_raw.to_le_bytes()); // OffsetToData (relocated via ADDR32NB)
        rsrc.extend_from_slice(&(block.len() as u32).to_le_bytes()); // Size
        rsrc.extend_from_slice(&0u32.to_le_bytes()); // CodePage
        rsrc.extend_from_slice(&0u32.to_le_bytes()); // Reserved
        off_raw += block.len() as u32;
    }

    for block in &raw_blocks {
        while rsrc.len() % 4 != 0 {
            rsrc.push(0);
        }
        rsrc.extend_from_slice(block);
    }
    while rsrc.len() % 4 != 0 {
        rsrc.push(0);
    }

    // Assemble COFF object
    let ptr_raw = 20u32 + 40u32;
    let ptr_relocs = ptr_raw + rsrc.len() as u32;
    let ptr_syms = ptr_relocs + (reloc_offsets.len() as u32) * 10;

    let mut coff = Vec::with_capacity(ptr_syms as usize + 18 + 4);
    // COFF header (20 bytes)
    coff.extend_from_slice(&0x8664u16.to_le_bytes()); // Machine: AMD64
    coff.extend_from_slice(&1u16.to_le_bytes()); // NumberOfSections
    coff.extend_from_slice(&0u32.to_le_bytes()); // TimeDateStamp
    coff.extend_from_slice(&ptr_syms.to_le_bytes()); // PointerToSymbolTable
    coff.extend_from_slice(&1u32.to_le_bytes()); // NumberOfSymbols
    coff.extend_from_slice(&0u16.to_le_bytes()); // SizeOfOptionalHeader
    coff.extend_from_slice(&0u16.to_le_bytes()); // Characteristics

    // Section header ".rsrc" (40 bytes)
    coff.extend_from_slice(b".rsrc\0\0\0");
    coff.extend_from_slice(&0u32.to_le_bytes()); // VirtualSize
    coff.extend_from_slice(&0u32.to_le_bytes()); // VirtualAddress
    coff.extend_from_slice(&(rsrc.len() as u32).to_le_bytes()); // SizeOfRawData
    coff.extend_from_slice(&ptr_raw.to_le_bytes()); // PointerToRawData
    coff.extend_from_slice(&ptr_relocs.to_le_bytes()); // PointerToRelocations
    coff.extend_from_slice(&0u32.to_le_bytes()); // PointerToLinenumbers
    coff.extend_from_slice(&(reloc_offsets.len() as u16).to_le_bytes()); // NumberOfRelocations
    coff.extend_from_slice(&0u16.to_le_bytes()); // NumberOfLinenumbers
    coff.extend_from_slice(&0x4000_0040u32.to_le_bytes()); // INITIALIZED_DATA | MEM_READ

    // Section data
    coff.extend_from_slice(&rsrc);

    // Relocations (IMAGE_REL_AMD64_ADDR32NB = 0x0003)
    for r_off in reloc_offsets {
        coff.extend_from_slice(&r_off.to_le_bytes());
        coff.extend_from_slice(&0u32.to_le_bytes()); // SymbolTableIndex 0 (.rsrc)
        coff.extend_from_slice(&0x0003u16.to_le_bytes());
    }

    // Symbol table: 1 static symbol ".rsrc" (18 bytes)
    coff.extend_from_slice(b".rsrc\0\0\0");
    coff.extend_from_slice(&0u32.to_le_bytes()); // Value
    coff.extend_from_slice(&1i16.to_le_bytes()); // SectionNumber (1-based)
    coff.extend_from_slice(&0u16.to_le_bytes()); // Type
    coff.push(3); // StorageClass: IMAGE_SYM_CLASS_STATIC
    coff.push(0); // NumberOfAuxSymbols

    // Empty string table (4 bytes)
    coff.extend_from_slice(&4u32.to_le_bytes());

    coff
}

# -*- mode: python ; coding: utf-8 -*-

_MODULE_FILES = [
    'antigravity_parser.py',
    'cursor_parser.py',
    'cursor_csv_importer.py',
    'data_sources.py',
    'models.py',
    'icon_gen.py',
    'popup_ui.py',
    'proto_decoder.py',
    'token_parser.py',
    'tray_app.py',
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[(f, '.') for f in _MODULE_FILES],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LLMTokenTracker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LLMTokenTracker',
)

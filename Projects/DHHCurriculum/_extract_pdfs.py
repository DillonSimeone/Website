import sys, pathlib
from pypdf import PdfReader

PDFS = [
    ("public/.PDFs/Sonic Agency_ A Group Autoethnography of Technology-mediated Performance Practice by Deaf and Hard of Hearing Musicians.pdf", "sonic_agency.txt"),
    ("public/.PDFs/20250403 - National Endowment for the Arts Applicant Portal-1.pdf", "nea_app.txt"),
    ("public/.PDFs/NIME24_paper58_GestoLuminaCameraReady.pdf", "gestolumina.txt"),
    ("public/.PDFs/CyberDeck Application-2.pdf", "cyberdeck_app.txt"),
]

out = pathlib.Path("output/dhh-curriculum/_extracted")
out.mkdir(parents=True, exist_ok=True)

for src, name in PDFS:
    try:
        r = PdfReader(src)
        pages = []
        for i, p in enumerate(r.pages):
            try:
                pages.append(f"\n===== PAGE {i+1} =====\n" + (p.extract_text() or ""))
            except Exception as e:
                pages.append(f"\n===== PAGE {i+1} =====\n[extract error: {e}]")
        (out / name).write_text("\n".join(pages), encoding="utf-8")
        print(f"OK {name} pages={len(r.pages)}")
    except Exception as e:
        print(f"FAIL {src}: {e}")

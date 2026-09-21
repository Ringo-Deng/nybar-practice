"""Restore source-page images for explanation tables missed by the initial importer.

Run with the bundled Python runtime. The source PDF and imported English text are
read only; this script adds image references to the published bank.
"""

from pathlib import Path
import json

import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parents[2]
LAYOUT = ROOT.parent / "import-work/pages/layout.json"
BANK = ROOT / "lib/question-bank.json"
PDF = ROOT / "public/uworld-2025/source.pdf"
IMAGE_DIR = ROOT / "public/uworld-2025/images"
AUDIT = ROOT / "data/uworld-2025/table-layout-repairs.json"


def needs_source_layout(page):
    lines = page["lines"]
    if not any("Explanation:" in line["text"] for line in lines[:3]):
        return False
    if any("original-layout" in image["src"] for image in page["images"]):
        return False
    # In the source layout, table content starts in a second column. Ordinary
    # indented bullets use x≈102–126; x>=165 in at least two early lines is a
    # conservative signal of a column whose reading order was flattened.
    return sum(line["x"] >= 165 for line in lines[1:18]) >= 2


def has_unextracted_visual_heading(question, page):
    if question["explanation"].get("images"):
        return False
    if page != question["explanation"]["originalPdfPages"][0]:
        return False
    heading = question["explanation"]["en"].split("\n\n", 1)[0].strip()
    # The source also uses text and path objects to draw one-column charts.
    # These pages begin with a short display heading, then a visually grouped
    # list or diagram; their page images were missing despite source prose
    # sometimes saying "see above image".
    return len(heading) < 90 and not heading.endswith((".", ":", "?", "!"))


def main():
    layout = json.loads(LAYOUT.read_text())
    bank = json.loads(BANK.read_text())
    question_for_page = {
        page: question
        for question in bank
        for page in question["explanation"]["originalPdfPages"]
    }
    candidates = [
        page for page in sorted(question_for_page)
        if (needs_source_layout(layout[page - 1])
            or has_unextracted_visual_heading(question_for_page[page], page))
        and not any(
            image["src"] == f"uworld-2025/images/p{page:04d}-original-layout.webp"
            for image in question_for_page[page]["explanation"].get("images", [])
        )
    ]
    if not candidates:
        print("No missing explanation table-layout pages.")
        return
    doc = pdfium.PdfDocument(str(PDF))
    repairs = json.loads(AUDIT.read_text()) if AUDIT.exists() else []
    added = 0
    for page in candidates:
        source_page = doc[page - 1]
        image = source_page.render(scale=1.5).to_pil()
        name = f"p{page:04d}-original-layout.webp"
        image.save(IMAGE_DIR / name, format="WEBP", lossless=True, method=4)
        source_page.close()
        reference = {
            "src": f"uworld-2025/images/{name}",
            "alt": f"原文排版（含表格或示意图）· PDF 第 {page} 页",
            "sourcePage": page,
            "width": image.width,
            "height": image.height,
        }
        question = question_for_page[page]
        question["explanation"].setdefault("images", []).append(reference)
        repairs.append({"questionId": question["id"], "page": page, "image": reference["src"]})
        added += 1
    BANK.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    AUDIT.write_text(json.dumps(repairs, ensure_ascii=False, indent=2) + "\n")
    print(f"Restored {added} explanation chart/table-layout pages; {len(repairs)} total repairs recorded.")


if __name__ == "__main__":
    main()

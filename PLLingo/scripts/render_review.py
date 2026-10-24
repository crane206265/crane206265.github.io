"""Reproduce local page renders; rendering does not itself mark a page reviewed."""
import json, math
from prepare_materials import BASE, ROOT, OUT, fitz

evidence = json.loads((ROOT / 'scripts/review-evidence.json').read_text(encoding='utf-8'))
manifest = json.loads((OUT / 'manifests/sources.json').read_text(encoding='utf-8'))
items = []
for record in evidence['documents']:
    source = next((s for s in manifest['sources'] if s['id'] == record['sourceId'] and s['sha256'] == record['sha256']), None)
    if source:
        for page in record['pages']:
            items.append((source, page))
if items:
    output = OUT / 'renders'; output.mkdir(parents=True, exist_ok=True)
    sheet = fitz.open(); contact = sheet.new_page(width=1800, height=math.ceil(len(items)/2)*450)
    for i, (source, number) in enumerate(items):
        document = fitz.open(BASE / source['materialsPath'])
        pix = document[number-1].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        pix.save(output / f"{source['id']}-p{number}.png")
        x = (i % 2)*900; y = (i//2)*450
        contact.insert_text((x+10, y+17), f"{source['materialsPath'].split('/')[-1]} PDF p.{number}", fontsize=12)
        contact.insert_image(fitz.Rect(x, y+25, x+880, y+440), stream=pix.tobytes('png'))
        document.close()
    contact.get_pixmap().save(output / 'review-contact.png')
    sheet.close()
print(f'Rendered {len(items)} historically inspected pages; no new verification inferred.')

"""Local-only, page-preserving PDF inventory. Never modifies or uploads originals."""
import os, sys, json, hashlib, re
from pathlib import Path
try:
    import pymupdf as fitz
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools/python'))
    import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
# Read only MATERIALS_DIR from .env; secrets are not needed by the PDF tool.
local_dir = None
if (ROOT / '.env').exists():
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if line.strip().startswith('MATERIALS_DIR='):
            local_dir = line.split('=', 1)[1].strip().strip('\"\'')
BASE = Path(os.environ.get('MATERIALS_DIR') or local_dir or ROOT / 'materials').resolve()
OUT = Path(os.environ.get('PRIVATE_DATA_DIR', ROOT / 'private-data')).resolve()

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def main():
    records = []
    try:
        previous = json.loads((OUT / 'manifests/sources.json').read_text(encoding='utf-8'))['sources']
    except (FileNotFoundError, ValueError, KeyError):
        previous = []
    for file in sorted(BASE.rglob('*.pdf')) if BASE.exists() else []:
        relative = file.relative_to(BASE).as_posix()
        sid = 'src-' + hashlib.sha256(relative.encode()).hexdigest()[:12]
        exam = 'past_exams/' in relative
        solution = bool(re.search(r'-sol\.pdf$', relative))
        week = int(file.name[:2]) if relative.startswith('lecture_notes/') else None
        rec = dict(id=sid, path='materials/' + relative, materialsPath=relative,
                   kind='solution_candidate' if solution else 'exam' if exam else 'lecture' if week else 'textbook',
                   week=week, topic=file.stem, examId=re.sub(r'-sol$', '', file.stem) if exam else None,
                   term='midterm' if 'midterm' in relative or 'mid_term' in relative else 'final' if 'final' in relative else None,
                   counterpart=None, pageCount=0, sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                   extractionStatus='pending', reviewStatus='not_reviewed', analysisStatus='indexed',
                   printedPageNumbers='not_mapped', errors=[])
        try:
            doc = fitz.open(file)
            pages = []
            for n, page in enumerate(doc, 1):
                value = page.get_text(sort=True)
                pages.append(dict(sourceId=sid, pdfPage=n, printedPage=None, text=value,
                                  needsOCR=len(value.strip()) < 30, visuallyReviewed=False))
            rec.update(pageCount=len(doc), extractionStatus='needs_ocr' if any(p['needsOCR'] for p in pages) else 'extracted')
            save(OUT / 'extracted' / (sid + '.json'), pages)
        except Exception as exc:
            rec.update(extractionStatus='failed', errors=[str(exc)])
        old = next((s for s in previous if s['id'] == sid and s['sha256'] == rec['sha256']), None)
        if old:
            rec['reviewStatus'] = old['reviewStatus']
            rec['analysisStatus'] = old['analysisStatus']
            if old['kind'] == 'solution':
                rec['kind'] = 'solution'
        records.append(rec)
    for rec in records:
        if rec['examId']:
            rec['counterpart'] = next((r['id'] for r in records if r['id'] != rec['id'] and r['examId'] == rec['examId']), None)
    manifest = dict(version=1, pageConvention='1-based PDF page; printed page separately nullable',
                    materialsAvailable=BASE.exists(), sources=records)
    save(OUT / 'manifests/sources.json', manifest)
    for name in ['topics', 'exam-patterns', 'renders']:
        (OUT / name).mkdir(parents=True, exist_ok=True)
    print(f"Indexed {len(records)} PDFs, {sum(r['pageCount'] for r in records)} pages; failures: {sum(r['extractionStatus']=='failed' for r in records)}")

if __name__ == '__main__':
    main()

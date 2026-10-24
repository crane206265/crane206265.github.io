import os, sys, tempfile, subprocess, json, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/python'))
import pymupdf

class PipelineTests(unittest.TestCase):
    def run_pipeline(self, materials, output):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/prepare_materials.py')],
            env={**os.environ, 'MATERIALS_DIR': str(materials), 'PRIVATE_DATA_DIR': str(output)},
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads((output / 'manifests/sources.json').read_text(encoding='utf-8'))

    def test_missing_materials_reports_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.run_pipeline(root / 'absent', root / 'output')
            self.assertFalse(manifest['materialsAvailable'])
            self.assertEqual(manifest['sources'], [])

    def test_corrupt_pdf_does_not_prevent_valid_file_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); materials = root / 'materials'; materials.mkdir()
            (materials / 'broken.pdf').write_bytes(b'%PDF- broken')
            doc = pymupdf.open(); page = doc.new_page(); page.insert_text((50,50),'A readable test PDF page. Source identity must be stable.')
            doc.save(materials / 'valid.pdf'); doc.close()
            manifest = self.run_pipeline(materials, root / 'output')
            self.assertEqual(len(manifest['sources']), 2)
            self.assertEqual(manifest['sources'][0]['extractionStatus'], 'failed')
            good = manifest['sources'][1]
            self.assertEqual(good['pageCount'], 1)
            pages = json.loads((root / 'output/extracted' / (good['id']+'.json')).read_text(encoding='utf-8'))
            self.assertEqual(pages[0]['pdfPage'], 1)
            self.assertEqual(pages[0]['sourceId'], good['id'])
            rerun = self.run_pipeline(materials, root / 'output')
            self.assertEqual(rerun['sources'][1]['id'], good['id'])
            self.assertEqual(rerun['sources'][1]['sha256'], good['sha256'])

if __name__ == '__main__':
    unittest.main()

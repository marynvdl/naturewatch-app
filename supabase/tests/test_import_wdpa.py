"""The October 2026 import refuses a file that does not match the pin."""

from __future__ import annotations

import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "supabase" / "import_wdpa.py"


def load_import_wdpa():
    spec = importlib.util.spec_from_file_location("import_wdpa", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


import_wdpa = load_import_wdpa()


class FakeBody(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class ImportWdpaTest(unittest.TestCase):
    def test_checksum_mismatch_refuses_the_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "wdpa.zip"

            def urlopen(request, timeout):
                self.assertEqual(request.full_url, import_wdpa.PINNED_URL)
                self.assertGreater(timeout, 0)
                return FakeBody(b"this is not the october wdpa zip")

            with mock.patch.object(import_wdpa.urllib.request, "urlopen", urlopen):
                with self.assertRaises(SystemExit) as raised:
                    import_wdpa.download(
                        import_wdpa.PINNED_URL, dest, import_wdpa.PINNED_SHA256
                    )
            message = str(raised.exception)
            self.assertIn("checksum mismatch", message)
            self.assertIn(import_wdpa.PINNED_SHA256, message)
            self.assertFalse(dest.exists())

    def test_pin_matches_the_migrations(self):
        url = import_wdpa.PINNED_URL
        checksum = import_wdpa.PINNED_SHA256
        self.assertEqual(len(checksum), 64)
        self.assertTrue(all(character in "0123456789abcdef" for character in checksum))
        self.assertNotIn("Public_ZAF", url)
        for relative in (
            "supabase/migrations/20261021120000_records.sql",
            "supabase/migrations/20261029200000_global_protected_areas.sql",
            "supabase/tests/records_fixture.sql",
        ):
            text = (ROOT / relative).read_text()
            self.assertIn(url, text, relative)
            self.assertIn(checksum, text, relative)


if __name__ == "__main__":
    unittest.main()

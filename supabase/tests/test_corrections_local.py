"""Layer corrections and their admin RPCs, against the local database.

Each test runs in one transaction that is rolled back. Skipped when the local
database is not running.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
import uuid
from pathlib import Path

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)
connect = test_reconcile_local.connect

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[31.0, -24.0], [31.1, -24.0], [31.1, -24.1], [31.0, -24.1], [31.0, -24.0]]],
}
BOWTIE = {
    "type": "Polygon",
    "coordinates": [[[31.0, -24.0], [31.1, -24.1], [31.1, -24.0], [31.0, -24.1], [31.0, -24.0]]],
}


def ring(n: int) -> dict:
    """A closed polygon with n distinct vertices on a small circle."""
    import math

    points = [
        [31.0 + 0.1 * math.cos(2 * math.pi * i / n), -24.0 + 0.1 * math.sin(2 * math.pi * i / n)]
        for i in range(n)
    ]
    return {"type": "Polygon", "coordinates": [points + [points[0]]]}


class CorrectionsLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        if self.conn.execute("select to_regclass('public.layer_corrections') as t").fetchone()["t"] is None:
            self.conn.close()
            self.skipTest("the corrections migration is not applied")
        self.admin = self.user()
        self.other = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def user(self) -> str:
        user_id = str(uuid.uuid4())
        self.conn.execute(
            """
            insert into auth.users (id, aud, role, email)
            values (%s, 'authenticated', 'authenticated', %s)
            """,
            (user_id, f"{user_id}@example.test"),
        )
        return user_id

    def act_as(self, user_id: str | None):
        self.conn.execute("reset role")
        if user_id is None:
            self.conn.execute("select set_config('request.jwt.claims', '', true)")
            self.conn.execute("set local role anon")
            return
        claims = json.dumps({"sub": user_id, "role": "authenticated"})
        self.conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        self.conn.execute("set local role authenticated")

    def call(self, sql: str, args: tuple = (), user_id: str | None = "admin"):
        self.act_as(self.admin if user_id == "admin" else user_id)
        rows = self.conn.execute(sql, args).fetchall()
        self.conn.execute("reset role")
        return rows

    def submit(
        self,
        shape: dict = SQUARE,
        action: str = "remove",
        value: dict | None = None,
        years: list[int] | None = None,
        user_id: str | None = "admin",
    ) -> str:
        return self.call(
            "select public.submit_correction(%s, %s, %s::jsonb, %s, %s, %s::jsonb, %s)::text as id",
            (
                "cropland",
                "v3",
                json.dumps(shape),
                [2024] if years is None else years,
                action,
                None if value is None else json.dumps(value),
                "Pivot is fallow grassland",
            ),
            user_id,
        )[0]["id"]

    def review(self, correction: str, status: str, note: str | None = None) -> dict:
        return self.call(
            "select review_status, reviewed_by::text as reviewed_by, reviewed_at, review_note "
            "from public.review_correction(%s, %s, %s)",
            (correction, status, note),
        )[0]

    def raises(self, error, fn, *args, **kwargs):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            fn(*args, **kwargs)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def test_admin_submits_and_reviews(self):
        correction = self.submit(action="add", value={"share": 0.4})
        row = self.call(
            "select layer_id, layer_version, years, action, value, note, review_status, "
            "submitted_by::text as submitted_by, extensions.geometrytype(geom) as kind "
            "from public.layer_corrections where id = %s",
            (correction,),
        )[0]
        self.assertEqual(row["layer_id"], "cropland")
        self.assertEqual(row["layer_version"], "v3")
        self.assertEqual(row["years"], [2024])
        self.assertEqual(row["value"], {"share": 0.4})
        self.assertEqual(row["review_status"], "submitted")
        self.assertEqual(row["submitted_by"], self.admin)
        self.assertEqual(row["kind"], "MULTIPOLYGON")

        approved = self.review(correction, "approved", "Checked on imagery")
        self.assertEqual(approved["review_status"], "approved")
        self.assertEqual(approved["reviewed_by"], self.admin)
        self.assertIsNotNone(approved["reviewed_at"])
        self.assertEqual(approved["review_note"], "Checked on imagery")

        self.assertEqual(self.review(correction, "rejected")["review_status"], "rejected")
        back = self.review(correction, "submitted")
        self.assertEqual(back["review_status"], "submitted")
        self.assertIsNone(back["reviewed_by"])
        self.assertIsNone(back["reviewed_at"])

    def test_others_cannot_submit_review_or_read(self):
        correction = self.submit()
        self.raises(self.errors.InsufficientPrivilege, self.submit, user_id=self.other)
        self.raises(
            self.errors.InsufficientPrivilege,
            self.call,
            "select * from public.review_correction(%s, 'approved')",
            (correction,),
            self.other,
        )
        rows = self.call("select id from public.layer_corrections", (), self.other)
        self.assertEqual(rows, [])
        self.raises(
            self.errors.InsufficientPrivilege,
            self.call,
            "select id from public.layer_corrections",
            (),
            None,
        )
        self.raises(
            self.errors.InsufficientPrivilege,
            self.call,
            "insert into public.layer_corrections (layer_id, geom, years, action) "
            "values ('cropland', extensions.st_multi(extensions.st_geomfromgeojson(%s)), "
            "'{2024}', 'remove')",
            (json.dumps(SQUARE),),
        )

    def test_refuses_bad_input(self):
        self.raises(self.errors.CheckViolation, self.submit, value={"share": 0.4})
        self.raises(self.errors.CheckViolation, self.submit, years=[])
        self.raises(self.errors.CheckViolation, self.submit, action="move")
        self.raises(self.errors.InvalidParameterValue, self.submit, shape=BOWTIE)
        self.raises(self.errors.InvalidParameterValue, self.submit, shape=ring(5001))
        self.raises(
            self.errors.InvalidParameterValue,
            self.submit,
            shape={"type": "Point", "coordinates": [31.0, -24.0]},
        )
        self.raises(
            self.errors.InvalidParameterValue,
            self.submit,
            shape={"type": "Polygon", "coordinates": "nonsense"},
        )
        correction = self.submit()
        self.raises(
            self.errors.InvalidParameterValue, self.review, correction, "withdrawn"
        )
        self.raises(self.errors.NoDataFound, self.review, str(uuid.uuid4()), "approved")

    def test_accepts_a_large_but_allowed_shape(self):
        correction = self.submit(shape=ring(4999))
        self.assertTrue(correction)

    def listed(self, statuses: list[str], limit: int = 50, offset: int = 0, user_id="admin"):
        return self.call(
            "select id::text as id, review_status, geojson, total_count "
            "from public.admin_correction_list(%s, %s, %s)",
            (statuses, limit, offset),
            user_id,
        )

    def test_lists_by_status_newest_first(self):
        before = {row["id"] for row in self.listed(["submitted", "approved", "rejected"], 1000)}
        first = self.submit()
        second = self.submit()
        third = self.submit()
        # One transaction gives all three the same created_at, so set them apart.
        for seconds, correction in ((3, first), (2, second), (1, third)):
            self.conn.execute(
                "update public.layer_corrections set created_at = now() - make_interval(secs => %s) "
                "where id = %s",
                (seconds, correction),
            )
        self.review(third, "approved")
        submitted = [row for row in self.listed(["submitted"], 1000) if row["id"] not in before]
        self.assertEqual([row["id"] for row in submitted], [second, first])
        self.assertEqual(submitted[0]["geojson"]["type"], "MultiPolygon")
        both = self.listed(["submitted", "approved"], 1000)
        self.assertEqual(
            {row["id"] for row in both} - before, {first, second, third}
        )
        page = self.listed(["submitted", "approved"], 1, 1)
        self.assertEqual(len(page), 1)
        self.assertEqual(page[0]["total_count"], len(both))
        self.raises(self.errors.InvalidParameterValue, self.listed, ["withdrawn"])
        self.raises(self.errors.InvalidParameterValue, self.listed, [])
        self.raises(self.errors.InvalidParameterValue, self.listed, ["submitted"], 1001)
        self.raises(
            self.errors.InsufficientPrivilege, self.listed, ["submitted"], user_id=self.other
        )

    def set_photos(self, correction: str, paths: list[str], user_id="admin"):
        return self.call(
            "select public.set_correction_photos(%s, %s) as paths",
            (correction, paths),
            user_id,
        )[0]["paths"]

    def test_sets_photos_under_the_correction(self):
        correction = self.submit()
        paths = [f"{correction}/a.jpg", f"{correction}/b.webp"]
        self.assertEqual(self.set_photos(correction, paths), paths)
        self.assertEqual(self.set_photos(correction, []), [])
        self.raises(
            self.errors.InvalidParameterValue,
            self.set_photos,
            correction,
            [f"{correction}/{n}.jpg" for n in range(7)],
        )
        self.raises(
            self.errors.InvalidParameterValue,
            self.set_photos,
            correction,
            [f"{uuid.uuid4()}/a.jpg"],
        )
        self.raises(
            self.errors.InvalidParameterValue,
            self.set_photos,
            correction,
            [f"{correction}/deeper/a.jpg"],
        )
        self.raises(
            self.errors.InsufficientPrivilege,
            self.set_photos,
            correction,
            [f"{correction}/a.jpg"],
            self.other,
        )
        missing = str(uuid.uuid4())
        self.raises(self.errors.NoDataFound, self.set_photos, missing, [f"{missing}/a.jpg"])

    def test_photo_bucket_is_private(self):
        row = self.conn.execute(
            "select public, file_size_limit, allowed_mime_types "
            "from storage.buckets where id = 'correction-photos'"
        ).fetchone()
        self.assertFalse(row["public"])
        self.assertEqual(row["file_size_limit"], 10485760)
        self.assertEqual(
            sorted(row["allowed_mime_types"]), ["image/jpeg", "image/png", "image/webp"]
        )


if __name__ == "__main__":
    unittest.main()

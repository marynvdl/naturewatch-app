"""submit_boundary, approve_boundary, reject_boundary, proposed_boundary,
current_boundary_shape, their audit rows, and check_boundaries.py measure --unchecked,
against the local database.

Each test runs in one transaction that is rolled back. Skipped when the local
database is not running.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)
connect = test_reconcile_local.connect

_spec = importlib.util.spec_from_file_location(
    "check_boundaries", Path(__file__).resolve().parents[1] / "check_boundaries.py"
)
check_boundaries = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = check_boundaries
_spec.loader.exec_module(check_boundaries)

PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"
SQUARE = {"type": "Polygon", "coordinates": [[[30, -20], [30.1, -20], [30.1, -19.9], [30, -19.9], [30, -20]]]}
BOWTIE = {"type": "Polygon", "coordinates": [[[30, -20], [30.1, -19.9], [30.1, -20], [30, -19.9], [30, -20]]]}


class ReplacementBoundaryLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        if self.conn.execute(
            "select to_regprocedure('public.submit_boundary(uuid, jsonb, text, uuid)') as f"
        ).fetchone()["f"] is None:
            self.conn.close()
            self.skipTest("the edit boundary migration is not applied")
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.admin = self.user()
        self.other = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )
        self.place_id, self.old = self.place("Zqx Upload Park")

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def user(self) -> str:
        user_id = str(uuid.uuid4())
        self.conn.execute(
            "insert into auth.users (id, aud, role, email) values (%s, 'authenticated', 'authenticated', %s)",
            (user_id, f"{user_id}@example.test"),
        )
        return user_id

    def place(self, name: str, current: bool = True) -> tuple[str, str]:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'conservation_area', 'published') returning id::text as id",
            (name,),
        ).fetchone()["id"]
        boundary = self.conn.execute(
            """
            insert into public.place_boundaries (
              place_id, version_number, geom, source_id, source_release_id, review_status, is_current
            ) values (%s, 1, extensions.ST_GeomFromText(%s, 4326)::extensions.geometry(MultiPolygon, 4326),
              'wdpca', %s, 'approved', %s)
            returning id::text as id
            """,
            (place_id, PARK, self.release, current),
        ).fetchone()["id"]
        return place_id, boundary

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

    def raises(self, error, fn, *args, **kwargs):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            fn(*args, **kwargs)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def submit(self, shape=SQUARE, place_id: str | None = None, source_url=None, user_id="admin",
               derived_from: str | None = None) -> str:
        return self.call(
            "select public.submit_boundary(%s, %s::jsonb, %s, %s)::text as id",
            (place_id or self.place_id, json.dumps(shape), source_url, derived_from),
            user_id,
        )[0]["id"]

    def approve(self, boundary: str, user_id="admin"):
        return self.call("select public.approve_boundary(%s)", (boundary,), user_id)

    def reject(self, boundary: str, user_id="admin"):
        return self.call("select public.reject_boundary(%s)", (boundary,), user_id)

    def row(self, boundary: str) -> dict:
        return self.conn.execute(
            "select version_number, review_status, is_current, superseded_at, source_id, source_url, "
            "submitted_by::text as submitted_by, reviewed_by::text as reviewed_by, reviewed_at, "
            "qc_status, stats_eligibility, extensions.st_npoints(geom) as points "
            "from public.place_boundaries where id = %s",
            (boundary,),
        ).fetchone()

    def audit(self, boundary: str) -> list[dict]:
        return self.conn.execute(
            "select action, actor::text as actor, old_values, new_values from public.audit_log "
            "where table_name = 'place_boundaries' and row_id = %s order by id",
            (boundary,),
        ).fetchall()

    # --- submit ---

    def test_submit_stores_a_proposed_version(self):
        new = self.submit(source_url="  https://example.test/park  ")
        row = self.row(new)
        self.assertEqual(row["version_number"], 2)
        self.assertEqual((row["review_status"], row["is_current"]), ("proposed", False))
        self.assertEqual(row["source_id"], "sooty-earth-contributors")
        self.assertEqual(row["source_url"], "https://example.test/park")
        self.assertEqual(row["submitted_by"], self.admin)
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("unchecked", "pending"))
        self.assertTrue(self.row(self.old)["is_current"])

    def test_submit_takes_a_multipolygon_and_drops_heights(self):
        shape = {"type": "MultiPolygon", "coordinates": [[[[30, -20, 5], [30.1, -20, 5], [30.1, -19.9, 5],
                                                            [30, -20, 5]]]]}
        self.assertEqual(self.row(self.submit(shape))["points"], 4)

    def test_submit_refusals(self):
        def submit(shape, user_id="admin", place_id=None):
            return lambda: self.submit(shape, place_id=place_id, user_id=user_id)

        self.raises(self.errors.InsufficientPrivilege, submit(SQUARE, self.other))
        self.raises(self.errors.InsufficientPrivilege, submit(SQUARE, None))
        self.raises(self.errors.NoDataFound, submit(SQUARE, place_id=str(uuid.uuid4())))
        self.raises(self.errors.InvalidParameterValue, submit({"type": "Point", "coordinates": [30, -20]}))
        self.raises(self.errors.InvalidParameterValue, submit({"type": "Polygon", "coordinates": "x"}))
        self.raises(self.errors.InvalidParameterValue, submit({"type": "Polygon", "coordinates": []}))
        self.raises(self.errors.InvalidParameterValue, submit(BOWTIE))
        self.raises(self.errors.InvalidParameterValue, submit(
            {"type": "Polygon", "coordinates": [[[3e5, 1e5], [3.1e5, 1e5], [3.1e5, 1.1e5], [3e5, 1e5]]]}
        ))
        ring = [[30 + i * 1e-6, -20] for i in range(100_000)] + [[30.1, -19.9], [30, -20]]
        self.raises(self.errors.InvalidParameterValue, submit({"type": "Polygon", "coordinates": [ring]}))
        no_current, _ = self.place("Zqx Upload Old", current=False)
        self.raises(self.errors.InvalidParameterValue, submit(SQUARE, place_id=no_current))

    def test_one_proposed_version_at_a_time(self):
        self.submit()
        self.raises(self.errors.InvalidParameterValue, self.submit)

    # --- approve and reject ---

    def test_approve_makes_it_current(self):
        new = self.submit()
        self.approve(new)
        row = self.row(new)
        self.assertEqual((row["review_status"], row["is_current"]), ("approved", True))
        self.assertEqual(row["reviewed_by"], self.admin)
        self.assertIsNotNone(row["reviewed_at"])
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("unchecked", "pending"))
        old = self.row(self.old)
        self.assertFalse(old["is_current"])
        self.assertIsNotNone(old["superseded_at"])
        self.assertEqual(old["review_status"], "approved")
        # The next upload is version 3.
        self.assertEqual(self.row(self.submit())["version_number"], 3)

    def test_approve_keeps_the_old_boundary_decisions(self):
        self.conn.execute(
            "update public.place_boundaries set qc_status = 'passed', stats_eligibility = 'eligible' "
            "where id = %s",
            (self.old,),
        )
        self.approve(self.submit())
        old = self.row(self.old)
        self.assertEqual((old["qc_status"], old["stats_eligibility"]), ("passed", "eligible"))

    def test_reject_discards_it(self):
        new = self.submit()
        self.reject(new)
        row = self.row(new)
        self.assertEqual((row["review_status"], row["is_current"]), ("rejected", False))
        self.assertEqual(row["reviewed_by"], self.admin)
        self.assertTrue(self.row(self.old)["is_current"])
        # Another upload is allowed after a discard.
        self.assertEqual(self.row(self.submit())["version_number"], 3)

    def test_approve_and_reject_refusals(self):
        new = self.submit()
        self.raises(self.errors.InsufficientPrivilege, lambda: self.approve(new, self.other))
        self.raises(self.errors.InsufficientPrivilege, lambda: self.reject(new, None))
        self.raises(self.errors.NoDataFound, lambda: self.approve(str(uuid.uuid4())))
        self.raises(self.errors.InvalidParameterValue, lambda: self.approve(self.old))
        self.raises(self.errors.InvalidParameterValue, lambda: self.reject(self.old))
        self.reject(new)
        self.raises(self.errors.InvalidParameterValue, lambda: self.approve(new))
        self.raises(self.errors.InvalidParameterValue, lambda: self.reject(new))

    # --- the proposed version ---

    def test_proposed_boundary_for_an_admin(self):
        self.assertEqual(self.call("select * from public.proposed_boundary(%s)", (self.place_id,)), [])
        new = self.submit(source_url="https://example.test")
        rows = self.call(
            "select boundary_id::text as id, area_km2, points, source_url, submitted_by::text as by, shape "
            "from public.proposed_boundary(%s)",
            (self.place_id,),
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["id"], rows[0]["points"], rows[0]["by"]), (new, 5, self.admin))
        self.assertGreater(rows[0]["area_km2"], 100)
        self.assertEqual(rows[0]["shape"]["type"], "MultiPolygon")
        self.approve(new)
        self.assertEqual(self.call("select * from public.proposed_boundary(%s)", (self.place_id,)), [])

    def test_proposed_boundary_is_admin_only(self):
        self.submit()
        self.raises(self.errors.InsufficientPrivilege,
                    lambda: self.call("select * from public.proposed_boundary(%s)", (self.place_id,), self.other))
        self.raises(self.errors.InsufficientPrivilege,
                    lambda: self.call("select * from public.proposed_boundary(%s)", (self.place_id,), None))

    def test_geometry_stays_ungranted(self):
        new = self.submit()
        self.raises(self.errors.InsufficientPrivilege, lambda: self.call(
            "select geom from public.place_boundaries where id = %s", (new,), self.admin
        ))

    # --- audit ---

    def test_upload_approval_and_supersede_are_audited_without_geom(self):
        new = self.submit()
        self.approve(new)
        rows = self.audit(new)
        self.assertEqual([r["action"] for r in rows], ["insert", "update"])
        self.assertEqual({r["actor"] for r in rows}, {self.admin})
        self.assertEqual(rows[1]["new_values"]["review_status"], "approved")
        old = self.audit(self.old)
        self.assertEqual(len(old), 1)
        self.assertFalse(old[0]["new_values"]["is_current"])
        for row in rows + old:
            self.assertNotIn("geom", row["new_values"])
            self.assertNotIn("geom", row["old_values"] or {})

    def test_reject_is_audited(self):
        new = self.submit()
        self.reject(new)
        self.assertEqual(self.audit(new)[-1]["new_values"]["review_status"], "rejected")

    def test_imported_inserts_are_not_audited(self):
        _, imported = self.place("Zqx Upload Imported")
        self.assertEqual(self.audit(imported), [])

    # --- editing on the map ---

    def shape_of(self, place_id: str, user_id="admin") -> list[dict]:
        return self.call(
            "select boundary_id::text as id, version_number, points, shape "
            "from public.current_boundary_shape(%s)",
            (place_id,),
            user_id,
        )

    def test_current_boundary_shape_for_an_admin(self):
        rows = self.shape_of(self.place_id)
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["id"], rows[0]["version_number"], rows[0]["points"]), (self.old, 1, 5))
        self.assertEqual(rows[0]["shape"]["type"], "MultiPolygon")
        no_current, _ = self.place("Zqx Upload Gone", current=False)
        self.assertEqual(self.shape_of(no_current), [])

    def test_current_boundary_shape_stops_at_5000_points(self):
        def ring(n: int) -> str:
            # n points: n - 2 along the bottom edge, one corner, and the closing point.
            edge = ", ".join(f"{30 + i * 0.2 / (n - 2):.9f} -20" for i in range(n - 2))
            return f"MULTIPOLYGON((({edge}, 30.1 -19.8, 30 -20)))"

        for n, has_shape in ((5000, True), (5001, False)):
            place_id = self.conn.execute(
                "insert into public.places (name, place_type_id, publication_status) "
                "values (%s, 'conservation_area', 'published') returning id::text as id",
                (f"Zqx Edit {n}",),
            ).fetchone()["id"]
            self.conn.execute(
                """
                insert into public.place_boundaries (
                  place_id, version_number, geom, source_id, source_release_id, review_status, is_current
                ) values (%s, 1, extensions.ST_GeomFromText(%s, 4326), 'wdpca', %s, 'approved', true)
                """,
                (place_id, ring(n), self.release),
            )
            row = self.shape_of(place_id)[0]
            self.assertEqual(row["points"], n)
            self.assertEqual(row["shape"] is not None, has_shape)

    def test_current_boundary_shape_is_admin_only(self):
        self.raises(self.errors.InsufficientPrivilege, lambda: self.shape_of(self.place_id, self.other))
        self.raises(self.errors.InsufficientPrivilege, lambda: self.shape_of(self.place_id, None))

    def test_an_edit_records_its_boundary(self):
        new = self.submit(derived_from=self.old)
        derived = self.conn.execute(
            "select derived_from_boundary_id::text as id from public.place_boundaries where id = %s", (new,)
        ).fetchone()["id"]
        self.assertEqual(derived, self.old)
        rows = self.call(
            "select derived_from_boundary_id::text as id from public.proposed_boundary(%s)", (self.place_id,)
        )
        self.assertEqual(rows[0]["id"], self.old)
        plain = self.submit(place_id=self.place("Zqx Upload Plain")[0])
        self.assertIsNone(self.conn.execute(
            "select derived_from_boundary_id from public.place_boundaries where id = %s", (plain,)
        ).fetchone()["derived_from_boundary_id"])

    def test_an_edit_must_start_from_the_current_boundary(self):
        _, other_boundary = self.place("Zqx Upload Other")
        self.raises(self.errors.InvalidParameterValue, lambda: self.submit(derived_from=other_boundary))
        self.raises(self.errors.InvalidParameterValue, lambda: self.submit(derived_from=str(uuid.uuid4())))
        self.approve(self.submit())
        # The first boundary is superseded now.
        self.raises(self.errors.InvalidParameterValue, lambda: self.submit(derived_from=self.old))

    # --- QC of unchecked boundaries ---

    def test_measure_unchecked_reads_only_unchecked_current_boundaries(self):
        _, checked = self.place("Zqx Upload Checked")
        self.conn.execute("update public.place_boundaries set qc_status = 'passed' where id = %s", (checked,))
        new = self.submit()
        self.approve(new)
        others = {r["id"] for r in self.conn.execute(
            "select id::text as id from public.place_boundaries where is_current and qc_status = 'unchecked'"
        ).fetchall()}
        with tempfile.TemporaryDirectory() as work, \
                mock.patch.object(self.conn, "commit", lambda: None), mock.patch("builtins.print"):
            stale = Path(work) / check_boundaries.UNCHECKED_NAME
            stale.write_text("stale\n")
            check_boundaries.run_measure(self.conn, Path(work), unchecked=True)
            measured = {m["boundary_id"] for m in check_boundaries.read_measures(Path(work), unchecked=True)}
            self.assertFalse((Path(work) / check_boundaries.MEASURES_NAME).exists())
            result = check_boundaries.load(self.conn, check_boundaries.read_measures(Path(work), unchecked=True))
        self.assertEqual(measured, others)
        self.assertIn(new, measured)
        self.assertNotIn(checked, measured)
        self.assertNotIn(self.old, measured)
        self.assertEqual(result["checked"], len(others))
        self.assertEqual(self.row(new)["qc_status"], "passed")


if __name__ == "__main__":
    unittest.main()

"""Boundary QC columns, boundary_checks, stats_eligible_boundaries, set_stats_eligibility,
and check_boundaries.py load, against the local database.

Each test runs in one transaction that is rolled back. Skipped when the local
database is not running.
"""

from __future__ import annotations

import importlib.util
import json
import sys
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


class BoundaryQcLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        if self.conn.execute("select to_regclass('public.boundary_checks') as t").fetchone()["t"] is None:
            self.conn.close()
            self.skipTest("the boundary QC migration is not applied")
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.admin = self.user()
        self.other = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )
        self.place_id, self.boundary = self.place("Zqx QC Park")

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

    def place(self, name: str, publication: str = "published", current: bool = True) -> tuple[str, str]:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'conservation_area', %s) returning id::text as id",
            (name, publication),
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

    def set_eligibility(self, eligibility: str, reason: str | None = None, user_id="admin",
                        boundary: str | None = None) -> dict:
        return self.call(
            "select qc_status, stats_eligibility, stats_eligibility_reason, "
            "stats_eligibility_set_by::text as set_by, stats_eligibility_set_at "
            "from public.set_stats_eligibility(%s, %s, %s)",
            (boundary or self.boundary, eligibility, reason),
            user_id,
        )[0]

    def set_qc(self, status: str, boundary: str | None = None):
        self.conn.execute(
            "update public.place_boundaries set qc_status = %s where id = %s",
            (status, boundary or self.boundary),
        )

    def boundary_row(self, boundary: str | None = None) -> dict:
        return self.conn.execute(
            "select qc_status, stats_eligibility, stats_eligibility_reason, stats_eligibility_set_at "
            "from public.place_boundaries where id = %s",
            (boundary or self.boundary,),
        ).fetchone()

    # --- columns and constraints ---

    def test_new_boundary_starts_unchecked_and_pending(self):
        row = self.boundary_row()
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("unchecked", "pending"))

    def test_eligible_needs_passed_or_accepted(self):
        self.raises(
            self.errors.CheckViolation,
            self.conn.execute,
            "update public.place_boundaries set stats_eligibility = 'eligible' where id = %s",
            (self.boundary,),
        )
        self.raises(
            self.errors.CheckViolation,
            self.conn.execute,
            "update public.place_boundaries set qc_status = 'maybe' where id = %s",
            (self.boundary,),
        )

    # --- set_stats_eligibility ---

    def test_admin_sets_eligibility(self):
        self.set_qc("passed")
        row = self.set_eligibility("eligible")
        self.assertEqual(row["stats_eligibility"], "eligible")
        self.assertIsNone(row["stats_eligibility_reason"])
        self.assertEqual(row["set_by"], self.admin)
        self.assertIsNotNone(row["stats_eligibility_set_at"])
        row = self.set_eligibility("excluded", "  Too costly for now  ")
        self.assertEqual(row["stats_eligibility_reason"], "Too costly for now")

    def test_reason_rules(self):
        self.raises(self.errors.InvalidParameterValue, self.set_eligibility, "excluded")
        self.set_qc("accepted")
        self.raises(self.errors.InvalidParameterValue, self.set_eligibility, "eligible")
        self.assertEqual(self.set_eligibility("eligible", "Parts are real islands")["stats_eligibility"], "eligible")

    def test_eligible_refused_unless_qc_allows(self):
        self.set_qc("flagged")
        self.raises(self.errors.CheckViolation, self.set_eligibility, "eligible", "Looks fine")

    def test_bad_input_refused(self):
        self.raises(self.errors.InvalidParameterValue, self.set_eligibility, "maybe", "x")
        self.raises(self.errors.NoDataFound, self.set_eligibility, "pending", None,
                    boundary=str(uuid.uuid4()))

    def test_non_admin_cannot_set_eligibility(self):
        self.raises(self.errors.InsufficientPrivilege, self.set_eligibility, "excluded", "x", self.other)
        self.raises(self.errors.InsufficientPrivilege, self.set_eligibility, "excluded", "x", None)

    # --- access ---

    def insert_check(self):
        self.conn.execute(
            "insert into public.boundary_checks (boundary_id, check_id, check_category, outcome, checker_version) "
            "values (%s, 'holes', 'modelling', 'pass', 'test')",
            (self.boundary,),
        )

    def test_checks_are_admin_only(self):
        self.insert_check()
        sql = "select count(*) as n from public.boundary_checks where boundary_id = %s"
        self.assertEqual(self.call(sql, (self.boundary,))[0]["n"], 1)
        self.assertEqual(self.call(sql, (self.boundary,), self.other)[0]["n"], 0)
        self.raises(self.errors.InsufficientPrivilege, self.call, sql, (self.boundary,), None)
        self.raises(
            self.errors.InsufficientPrivilege,
            self.call,
            "insert into public.boundary_checks (boundary_id, check_id, check_category, outcome, checker_version) "
            "values (%s, 'holes', 'modelling', 'pass', 'x')",
            (self.boundary,),
        )

    def test_check_values_are_checked(self):
        self.raises(
            self.errors.CheckViolation,
            self.conn.execute,
            "insert into public.boundary_checks (boundary_id, check_id, check_category, outcome, checker_version) "
            "values (%s, 'holes', 'modelling', 'maybe', 'test')",
            (self.boundary,),
        )

    def test_view_is_for_the_service_role_only(self):
        self.raises(self.errors.InsufficientPrivilege, self.call,
                    "select * from public.stats_eligible_boundaries limit 1")

    def test_authenticated_reads_the_qc_columns(self):
        rows = self.call(
            "select qc_status, stats_eligibility from public.place_boundaries where id = %s",
            (self.boundary,), self.other,
        )
        self.assertEqual(rows[0]["qc_status"], "unchecked")

    def test_view_keeps_only_current_eligible_published(self):
        self.set_qc("passed")
        self.set_eligibility("eligible")
        _, pending = self.place("Zqx QC Pending")
        _, excluded = self.place("Zqx QC Excluded")
        self.set_qc("passed", excluded)
        self.set_eligibility("excluded", "x", boundary=excluded)
        _, draft = self.place("Zqx QC Draft", publication="draft")
        _, old = self.place("Zqx QC Old", current=False)
        for b in (draft, old):
            self.conn.execute(
                "update public.place_boundaries set qc_status = 'passed', stats_eligibility = 'eligible' "
                "where id = %s", (b,),
            )
        ids = {r["id"] for r in self.conn.execute(
            "select boundary_id::text as id from public.stats_eligible_boundaries"
        ).fetchall()}
        self.assertIn(self.boundary, ids)
        for b in (pending, excluded, draft, old):
            self.assertNotIn(b, ids)

    # --- accept_boundary_qc ---

    def accept(self, user_id="admin", boundary: str | None = None) -> dict:
        return self.call(
            "select boundary_id::text as id, qc_status from public.accept_boundary_qc(%s)",
            (boundary or self.boundary,), user_id,
        )[0]

    def test_admin_accepts_a_flagged_boundary(self):
        self.set_qc("flagged")
        self.assertEqual(self.accept(), {"id": self.boundary, "qc_status": "accepted"})
        self.assertEqual(self.set_eligibility("eligible", "Real islands")["stats_eligibility"], "eligible")

    def test_accept_refuses_other_statuses_and_old_boundaries(self):
        for status in ("passed", "accepted", "unchecked"):
            self.set_qc(status)
            self.raises(self.errors.InvalidParameterValue, self.accept)
        _, old = self.place("Zqx QC Old", current=False)
        self.set_qc("flagged", old)
        self.raises(self.errors.InvalidParameterValue, self.accept, boundary=old)
        self.raises(self.errors.NoDataFound, self.accept, boundary=str(uuid.uuid4()))

    def test_non_admin_cannot_accept(self):
        self.set_qc("flagged")
        self.raises(self.errors.InsufficientPrivilege, self.accept, self.other)
        self.raises(self.errors.InsufficientPrivilege, self.accept, None)

    # --- admin_boundary_list ---

    def finding(self, boundary: str, check_id: str, outcome: str, value: float | None = None,
                at: str = "2026-11-27 10:00"):
        self.conn.execute(
            "insert into public.boundary_checks (boundary_id, check_id, check_category, outcome, "
            "measured_value, checker_version, checked_at) values (%s, %s, %s, %s, %s, 'test', %s)",
            (boundary, check_id, "processing_cost" if check_id == "vertex_count" else "modelling",
             outcome, value, at),
        )

    def boundary_list(self, eligibility: str, user_id="admin", limit=200, offset=0) -> list[dict]:
        return self.call(
            "select place_id::text as place_id, name, boundary_id::text as boundary_id, qc_status, "
            "stats_eligibility_reason as reason, warnings, vertex_count, total_count "
            "from public.admin_boundary_list(%s, %s, %s)",
            (eligibility, limit, offset), user_id,
        )

    def ours(self, rows: list[dict]) -> list[dict]:
        return [r for r in rows if r["name"].startswith("Zqx QC")]

    def test_list_filters_and_shows_findings(self):
        self.set_qc("flagged")
        self.finding(self.boundary, "small_components", "warn", 0.8)
        self.finding(self.boundary, "holes", "warn", 0.9, at="2026-11-26 10:00")
        self.finding(self.boundary, "holes", "pass", 0.1)
        self.finding(self.boundary, "vertex_count", "warn", 150000)
        _, excluded = self.place("Zqx QC Excluded")
        self.set_qc("passed", excluded)
        self.set_eligibility("excluded", "Duplicate of a park", boundary=excluded)
        _, eligible = self.place("Zqx QC Eligible")
        self.set_qc("passed", eligible)
        self.set_eligibility("eligible", boundary=eligible)
        _, draft = self.place("Zqx QC Draft", publication="draft")
        _, old = self.place("Zqx QC Old", current=False)

        pending = self.ours(self.boundary_list("pending"))
        self.assertEqual([r["boundary_id"] for r in pending], [self.boundary])
        row = pending[0]
        self.assertEqual(row["warnings"], ["small_components", "vertex_count"])
        self.assertEqual(row["vertex_count"], 150000)
        self.assertEqual(row["qc_status"], "flagged")
        self.assertNotIn(draft, [r["boundary_id"] for r in pending])
        self.assertNotIn(old, [r["boundary_id"] for r in pending])

        out = self.ours(self.boundary_list("excluded"))
        self.assertEqual([(r["boundary_id"], r["reason"], r["warnings"]) for r in out],
                         [(excluded, "Duplicate of a park", [])])

    def test_list_total_and_pages(self):
        self.place("Zqx QC Second")
        rows = self.boundary_list("pending", limit=1)
        self.assertEqual(len(rows), 1)
        self.assertGreaterEqual(rows[0]["total_count"], 2)

    def test_list_refusals(self):
        self.raises(self.errors.InsufficientPrivilege, self.boundary_list, "pending", self.other)
        self.raises(self.errors.InsufficientPrivilege, self.boundary_list, "pending", None)
        self.raises(self.errors.InvalidParameterValue, self.boundary_list, "eligible")
        self.raises(self.errors.InvalidParameterValue, self.boundary_list, "pending", "admin", 0)

    # --- audit ---

    def audit_rows(self) -> list[dict]:
        return self.conn.execute(
            "select action, actor::text as actor, old_values, new_values from public.audit_log "
            "where table_name = 'place_boundaries' and row_id = %s order by id",
            (self.boundary,),
        ).fetchall()

    def test_review_changes_are_audited_without_geom(self):
        self.set_qc("flagged")
        self.accept()
        self.set_eligibility("excluded", "Not a park")
        rows = self.audit_rows()
        self.assertEqual(len(rows), 3)
        accepted = rows[1]
        self.assertEqual(accepted["actor"], self.admin)
        self.assertEqual((accepted["old_values"]["qc_status"], accepted["new_values"]["qc_status"]),
                         ("flagged", "accepted"))
        for row in rows:
            self.assertNotIn("geom", row["old_values"])
            self.assertNotIn("geom", row["new_values"])
            self.assertIn("area_km2", row["new_values"])

    def test_other_updates_are_not_audited(self):
        self.conn.execute(
            "update public.place_boundaries set source_url = 'https://example.test' where id = %s",
            (self.boundary,),
        )
        self.conn.execute(
            "update public.place_boundaries set qc_status = qc_status where id = %s", (self.boundary,),
        )
        self.assertEqual(self.audit_rows(), [])

    def test_other_audit_triggers_keep_their_keys(self):
        self.conn.execute("delete from public.user_roles where user_id = %s", (self.admin,))
        row = self.conn.execute(
            "select row_id from public.audit_log where table_name = 'user_roles' order by id desc limit 1"
        ).fetchone()
        self.assertEqual(row["row_id"], f"{self.admin}/admin")

    # --- load ---

    def load(self, rows: list[dict]):
        with mock.patch.object(self.conn, "commit", lambda: None), mock.patch("builtins.print"):
            return check_boundaries.load(self.conn, rows, batch=2)

    def test_load_writes_findings_status_and_eligibility(self):
        n = len(check_boundaries.SIZE_EDGES_KM2)
        _, flagged = self.place("Zqx QC Flagged")
        _, heavy = self.place("Zqx QC Heavy")
        _, decided = self.place("Zqx QC Decided")
        self.set_qc("passed", decided)
        self.set_eligibility("excluded", "Not for Stats", boundary=decided)
        _, old = self.place("Zqx QC Old", current=False)

        def m(boundary, **kw):
            row = {"boundary_id": boundary, "place_type_id": "conservation_area", "valid": True,
                   "valid_reason": "", "vertices": 5, "parts": 1, "holes": 0,
                   "parts_lt": [0] * n, "holes_lt": [0] * n}
            row.update(kw)
            return row

        result = self.load([
            m(self.boundary),
            m(flagged, valid=False, valid_reason="Self-intersection"),
            m(heavy, vertices=check_boundaries.VERTEX_CAP + 1),
            m(decided),
            m(old),
        ])
        self.assertEqual(result["checked"], 4)

        row = self.boundary_row()
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("passed", "eligible"))
        self.assertEqual(row["stats_eligibility_reason"], check_boundaries.eligible_reason())
        self.assertEqual(
            (self.boundary_row(flagged)["qc_status"], self.boundary_row(flagged)["stats_eligibility"]),
            ("flagged", "pending"),
        )
        self.assertEqual(
            (self.boundary_row(heavy)["qc_status"], self.boundary_row(heavy)["stats_eligibility"]),
            ("passed", "pending"),
        )
        self.assertEqual(self.boundary_row(decided)["stats_eligibility"], "excluded")
        self.assertEqual(self.boundary_row(old)["qc_status"], "unchecked")

        checks = self.conn.execute(
            "select check_id, outcome, checker_version from public.boundary_checks "
            "where boundary_id = %s order by check_id",
            (flagged,),
        ).fetchall()
        self.assertEqual([c["check_id"] for c in checks],
                         ["geometry_valid", "holes", "small_components", "vertex_count"])
        self.assertEqual(checks[0]["outcome"], "fail")
        self.assertEqual({c["checker_version"] for c in checks}, {check_boundaries.CHECKER_VERSION})
        self.assertEqual(self.conn.execute(
            "select count(*) as n from public.boundary_checks where boundary_id = %s", (old,)
        ).fetchone()["n"], 0)

        again = self.load([m(self.boundary), m(flagged)])
        self.assertEqual(again["checked"], 0)

    def test_load_keeps_accepted_and_unseats_a_flagged_eligible(self):
        n = len(check_boundaries.SIZE_EDGES_KM2)
        _, accepted = self.place("Zqx QC Accepted")
        self.set_qc("accepted", accepted)
        self.set_qc("passed")
        self.set_eligibility("eligible")
        bad = {"place_type_id": "conservation_area", "valid": False, "valid_reason": "x",
               "vertices": 5, "parts": 1, "holes": 0, "parts_lt": [0] * n, "holes_lt": [0] * n}
        self.load([{**bad, "boundary_id": self.boundary}, {**bad, "boundary_id": accepted}])
        row = self.boundary_row()
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("flagged", "pending"))
        self.assertIn("back to pending", row["stats_eligibility_reason"])
        self.assertEqual(self.boundary_row(accepted)["qc_status"], "accepted")


if __name__ == "__main__":
    unittest.main()

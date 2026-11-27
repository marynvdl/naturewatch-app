"""Boundary QC columns, boundary_checks, stats_eligible_boundaries, set_stats_eligibility,
review_boundary, the boundary review filter and notes, and check_boundaries.py load,
against the local database.

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
        # Details make a published place listed, for the list reads.
        self.conn.execute(
            "insert into public.conservation_area_details (place_id, designation, iso3, realm, "
            "source_id, source_release_id) values (%s, 'Zqx', array['ZWE'], 'Terrestrial', 'wdpca', %s)",
            (place_id, self.release),
        )
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

    # --- review_boundary ---

    def review(self, verdict: str, note: str | None = None, user_id="admin",
               boundary: str | None = None) -> dict:
        return self.call(
            "select qc_status, stats_eligibility, stats_eligibility_reason as reason "
            "from public.review_boundary(%s, %s, %s)",
            (boundary or self.boundary, verdict, note), user_id,
        )[0]

    def finding(self, boundary: str, check_id: str, outcome: str, value: float | None = None,
                at: str = "2026-11-27 10:00", threshold: float | None = None):
        self.conn.execute(
            "insert into public.boundary_checks (boundary_id, check_id, check_category, outcome, "
            "measured_value, threshold_used, checker_version, checked_at) "
            "values (%s, %s, %s, %s, %s, %s, 'test', %s)",
            (boundary, check_id, "processing_cost" if check_id == "vertex_count" else "modelling",
             outcome, value, threshold, at),
        )

    def flag(self, boundary: str | None = None):
        b = boundary or self.boundary
        self.finding(b, "small_components", "warn", 0.8)
        self.finding(b, "vertex_count", "warn", 150000, threshold=100000)
        self.set_qc("flagged", b)

    def test_count_accepts_a_flagged_boundary_with_a_note(self):
        self.flag()
        self.raises(self.errors.InvalidParameterValue, self.review, "count")
        row = self.review("count", "  Real islands ")
        self.assertEqual(row, {"qc_status": "accepted", "stats_eligibility": "eligible",
                               "reason": "Real islands"})
        self.assertEqual(self.boundary_row()["stats_eligibility_set_at"] is not None, True)

    def test_count_a_passed_boundary_needs_no_note(self):
        self.set_qc("passed")
        self.assertEqual(self.review("count")["stats_eligibility"], "eligible")

    def test_count_refuses_unchecked_and_rejected(self):
        self.raises(self.errors.InvalidParameterValue, self.review, "count", "x")
        self.set_qc("rejected")
        self.raises(self.errors.InvalidParameterValue, self.review, "count", "x")

    def test_fix_and_leave_out(self):
        self.set_qc("passed")
        self.review("count")
        row = self.review("fix")
        self.assertEqual(row, {"qc_status": "rejected", "stats_eligibility": "pending", "reason": None})
        self.raises(self.errors.InvalidParameterValue, self.review, "leave_out")
        row = self.review("leave_out", "Duplicate of a park")
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("rejected", "excluded"))

    def test_undo_goes_back_to_what_the_checks_say(self):
        self.flag()
        self.review("count", "Real islands")
        self.assertEqual(self.review("undo"),
                         {"qc_status": "flagged", "stats_eligibility": "pending", "reason": None})
        self.review("fix")
        self.assertEqual(self.review("undo")["qc_status"], "flagged")
        # Only the heavy check warns: the shape passed.
        _, heavy = self.place("Zqx QC Heavy")
        self.finding(heavy, "small_components", "pass", 0.1)
        self.finding(heavy, "vertex_count", "warn", 150000, threshold=100000)
        self.set_qc("passed", heavy)
        self.review("fix", boundary=heavy)
        self.assertEqual(self.review("undo", boundary=heavy)["qc_status"], "passed")
        # No findings at all: unchecked.
        _, bare = self.place("Zqx QC Bare")
        self.set_qc("rejected", bare)
        self.assertEqual(self.review("undo", boundary=bare)["qc_status"], "unchecked")

    def test_review_refusals(self):
        self.set_qc("passed")
        self.raises(self.errors.InsufficientPrivilege, self.review, "count", None, self.other)
        self.raises(self.errors.InsufficientPrivilege, self.review, "count", None, None)
        self.raises(self.errors.InvalidParameterValue, self.review, "maybe")
        self.raises(self.errors.InvalidParameterValue, self.review, "leave_out", "x" * 1001)
        self.raises(self.errors.NoDataFound, self.review, "count", None, "admin", str(uuid.uuid4()))
        _, old = self.place("Zqx QC Old", current=False)
        self.raises(self.errors.InvalidParameterValue, self.review, "fix", None, "admin", old)

    # --- the list filter and the notes ---

    def window_ids(self, view: str | None, user_id="admin") -> set[str]:
        rows = self.call(
            "select id::text as id from public.place_window(array['conservation_area'], "
            "p_search => 'Zqx QC', p_limit => 50, p_boundary_review => %s)",
            (view,), user_id,
        )
        return {r["id"] for r in rows}

    def test_filter_views(self):
        self.flag()
        fix_place, fix = self.place("Zqx QC Fix")
        self.set_qc("passed", fix)
        self.review("fix", boundary=fix)
        out_place, out = self.place("Zqx QC Out")
        self.set_qc("passed", out)
        self.review("leave_out", "Too small", boundary=out)
        ok_place, ok = self.place("Zqx QC Ok")
        self.set_qc("passed", ok)
        self.review("count", boundary=ok)

        self.assertEqual(self.window_ids("to_review"), {self.place_id})
        self.assertEqual(self.window_ids("needs_fixing"), {fix_place})
        self.assertEqual(self.window_ids("left_out"), {out_place})
        self.assertEqual(self.window_ids(None), {self.place_id, fix_place, out_place, ok_place})
        count = self.call(
            "select public.place_window_count(array['conservation_area'], p_search => 'Zqx QC', "
            "p_boundary_review => 'needs_fixing') as n"
        )[0]["n"]
        self.assertEqual(count, 1)
        self.raises(self.errors.InvalidParameterValue, self.window_ids, "eligible")

    def test_filter_keeps_nothing_for_others_and_visitors_still_list(self):
        self.flag()
        self.assertEqual(self.window_ids("to_review", self.other), set())
        self.assertEqual(self.window_ids("to_review", None), set())
        self.assertIn(self.place_id, self.window_ids(None, None))

    def test_notes(self):
        self.flag()
        rows = self.call(
            "select place_id::text as place_id, qc_status, warnings, vertex_count, vertex_cap "
            "from public.boundary_review_notes(%s::uuid[])",
            ([self.place_id],),
        )
        self.assertEqual(rows, [{"place_id": self.place_id, "qc_status": "flagged",
                                 "warnings": ["small_components", "vertex_count"],
                                 "vertex_count": 150000, "vertex_cap": 100000}])
        self.raises(self.errors.InsufficientPrivilege, self.call,
                    "select * from public.boundary_review_notes(%s::uuid[])", ([self.place_id],),
                    self.other)

    # --- audit ---

    def audit_rows(self) -> list[dict]:
        return self.conn.execute(
            "select action, actor::text as actor, old_values, new_values from public.audit_log "
            "where table_name = 'place_boundaries' and row_id = %s order by id",
            (self.boundary,),
        ).fetchall()

    def test_review_changes_are_audited_without_geom(self):
        self.flag()
        self.review("count", "Real islands")
        self.review("leave_out", "Not a park")
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

    def test_load_keeps_rejected_and_never_makes_it_eligible(self):
        n = len(check_boundaries.SIZE_EDGES_KM2)
        self.set_qc("rejected")
        good = {"place_type_id": "conservation_area", "valid": True, "valid_reason": "",
                "vertices": 5, "parts": 1, "holes": 0, "parts_lt": [0] * n, "holes_lt": [0] * n}
        self.load([{**good, "boundary_id": self.boundary}])
        row = self.boundary_row()
        self.assertEqual((row["qc_status"], row["stats_eligibility"]), ("rejected", "pending"))


if __name__ == "__main__":
    unittest.main()

"""review_overlap, the link review filter, and overlap_review_notes, against the local
database (Shaping Boundaries task 04).

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

PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"


class OverlapReviewLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        if self.conn.execute(
            "select to_regprocedure('public.review_overlap(uuid, text, uuid)') as f"
        ).fetchone()["f"] is None:
            self.conn.close()
            self.skipTest("the overlap review migration is not applied")
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.admin = self.user()
        self.other = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )
        self.a, self.a_boundary = self.place("Zqx Overlap Alpha")
        self.b, self.b_boundary = self.place("Zqx Overlap Beta")
        self.rec, self.rec_boundary = self.place("Zqx Overlap Ramsar", "ramsar_site")
        self.pair = self.link(self.a, "overlaps", self.b, 0.4, 0.92)
        self.recognises = self.link(self.rec, "recognises", self.a, 0.3, 0.6)

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

    def place(self, name: str, place_type: str = "conservation_area") -> tuple[str, str]:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, 'published') returning id::text as id",
            (name, place_type),
        ).fetchone()["id"]
        boundary = self.conn.execute(
            """
            insert into public.place_boundaries (
              place_id, version_number, geom, source_id, source_release_id, review_status, is_current,
              qc_status, stats_eligibility
            ) values (%s, 1, extensions.ST_GeomFromText(%s, 4326)::extensions.geometry(MultiPolygon, 4326),
              'wdpca', %s, 'approved', true, 'passed', 'eligible')
            returning id::text as id
            """,
            (place_id, PARK, self.release),
        ).fetchone()["id"]
        if place_type == "conservation_area":
            self.conn.execute(
                "insert into public.conservation_area_details (place_id, designation, iso3, realm, "
                "source_id, source_release_id) values (%s, 'Zqx', array['ZWE'], 'Terrestrial', 'wdpca', %s)",
                (place_id, self.release),
            )
        else:
            self.conn.execute(
                "insert into public.recognition_details (place_id, designation, iso3, "
                "source_id, source_release_id) values (%s, 'Zqx', array['ZWE'], 'wdpca', %s)",
                (place_id, self.release),
            )
        return place_id, boundary

    def boundary_of(self, place_id: str) -> str:
        return self.conn.execute(
            "select id::text as id from public.place_boundaries where place_id = %s and is_current",
            (place_id,),
        ).fetchone()["id"]

    def link(self, subject: str, kind: str, obj: str, subject_share: float, object_share: float,
             origin: str = "derived") -> str:
        if kind == "overlaps" and subject > obj:
            subject, obj = obj, subject
            subject_share, object_share = object_share, subject_share
        derived = origin == "derived"
        return self.conn.execute(
            """
            insert into public.place_relationships (
              subject_place_id, relationship_type_id, object_place_id, origin, status,
              subject_boundary_id, object_boundary_id, subject_coverage, object_coverage,
              source_id, source_release_id
            ) values (%s, %s, %s, %s, 'proposed', %s, %s, %s, %s, 'wdpca', %s)
            returning id::text as id
            """,
            (subject, kind, obj, origin,
             self.boundary_of(subject) if derived else None,
             self.boundary_of(obj) if derived else None,
             subject_share if derived else None, object_share if derived else None, self.release),
        ).fetchone()["id"]

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

    def review(self, link: str, decision: str, hide: str | None = None, user_id="admin") -> str:
        return self.call(
            "select public.review_overlap(%s, %s, %s) as status", (link, decision, hide), user_id
        )[0]["status"]

    def link_row(self, link: str) -> dict:
        return self.conn.execute(
            "select status, reviewed_by::text as reviewed_by from public.place_relationships where id = %s",
            (link,),
        ).fetchone()

    def place_row(self, place_id: str) -> dict:
        return self.conn.execute(
            """
            select p.publication_status, p.withdrawal_reason, p.withdrawn_by::text as withdrawn_by,
              b.stats_eligibility, b.stats_eligibility_reason
            from public.places as p
            join public.place_boundaries as b on b.place_id = p.id and b.is_current
            where p.id = %s
            """,
            (place_id,),
        ).fetchone()

    # Decisions ---------------------------------------------------------------------------

    def test_keep_and_not_related(self):
        self.assertEqual(self.review(self.recognises, "keep"), "confirmed")
        self.assertEqual(self.link_row(self.recognises),
                         {"status": "confirmed", "reviewed_by": self.admin})
        self.assertEqual(self.review(self.pair, "not_related"), "rejected")
        self.assertEqual(self.place_row(self.a)["publication_status"], "published")

    def test_same_place_hides_one_end(self):
        self.assertEqual(self.review(self.pair, "same_place", self.b), "confirmed")
        reason = "Same place as Zqx Overlap Alpha"
        self.assertEqual(self.place_row(self.b), {
            "publication_status": "withdrawn", "withdrawal_reason": reason,
            "withdrawn_by": self.admin, "stats_eligibility": "excluded",
            "stats_eligibility_reason": reason,
        })
        self.assertEqual(self.place_row(self.a)["publication_status"], "published")

    def test_same_place_reason_is_cut_to_80(self):
        self.conn.execute("update public.places set name = %s where id = %s", ("Zqx " + "a" * 100, self.a))
        self.review(self.pair, "same_place", self.b)
        self.assertEqual(len(self.place_row(self.b)["withdrawal_reason"]), 80)

    def test_undo_after_keep(self):
        self.review(self.recognises, "keep")
        self.assertEqual(self.review(self.recognises, "undo"), "proposed")

    def test_undo_after_same_place(self):
        self.review(self.pair, "same_place", self.a)
        self.assertEqual(self.review(self.pair, "undo"), "proposed")
        row = self.place_row(self.a)
        self.assertEqual(row["publication_status"], "published")
        self.assertIsNone(row["withdrawal_reason"])
        self.assertEqual(row["stats_eligibility"], "pending")
        self.assertIsNone(row["stats_eligibility_reason"])

    def test_undo_leaves_a_place_hidden_for_another_reason(self):
        self.review(self.pair, "keep")
        self.call("select public.set_place_publication(%s, 'withdrawn', 'Duplicate of a WHS')", (self.b,))
        self.review(self.pair, "undo")
        self.assertEqual(self.place_row(self.b)["publication_status"], "withdrawn")

    # Refusals ----------------------------------------------------------------------------

    def test_refusals(self):
        errors = self.errors
        self.raises(errors.InsufficientPrivilege, self.review, self.pair, "keep", user_id=self.other)
        self.raises(errors.InvalidParameterValue, self.review, self.pair, "merge")
        self.raises(errors.NoDataFound, self.review, str(uuid.uuid4()), "keep")
        # Same place: only two conservation areas, and the hide id is one end.
        self.raises(errors.InvalidParameterValue, self.review, self.recognises, "same_place", self.a)
        self.raises(errors.InvalidParameterValue, self.review, self.pair, "same_place", self.rec)
        self.raises(errors.InvalidParameterValue, self.review, self.pair, "same_place", None)
        # Undo: not on a proposed link.
        self.raises(errors.InvalidParameterValue, self.review, self.pair, "undo")
        # A reviewed link needs Back to review first.
        self.review(self.pair, "keep")
        self.raises(errors.InvalidParameterValue, self.review, self.pair, "not_related")

    def test_same_place_refuses_an_overlap_with_a_recognition(self):
        mixed = self.link(self.b, "overlaps", self.rec, 0.2, 0.2)
        self.raises(self.errors.InvalidParameterValue, self.review, mixed, "same_place", self.b)

    def test_retired_link_refused(self):
        self.conn.execute("update public.place_relationships set retired_at = now() where id = %s", (self.pair,))
        self.raises(self.errors.InvalidParameterValue, self.review, self.pair, "keep")

    def test_undo_refuses_a_manual_link(self):
        self.conn.execute("delete from public.place_relationships where id = %s", (self.pair,))
        manual = self.link(self.a, "overlaps", self.b, 0, 0, origin="manual")
        self.assertEqual(self.review(manual, "keep"), "confirmed")
        self.raises(self.errors.InvalidParameterValue, self.review, manual, "undo")

    # The list filter ---------------------------------------------------------------------

    def window_ids(self, view: str | None, user_id="admin", types=("conservation_area", "ramsar_site")) -> set[str]:
        rows = self.call(
            "select id::text as id from public.place_window(%s, "
            "p_search => 'Zqx Overlap', p_limit => 50, p_overlap_review => %s)",
            (list(types), view), user_id,
        )
        return {r["id"] for r in rows}

    def test_filter_views(self):
        self.assertEqual(self.window_ids("overlaps"), {self.a, self.b})
        self.assertEqual(self.window_ids("recognises"), {self.a, self.rec})
        self.assertEqual(self.window_ids(None), {self.a, self.b, self.rec})
        self.review(self.pair, "keep")
        self.assertEqual(self.window_ids("overlaps"), set())
        count = self.call(
            "select public.place_window_count(array['conservation_area'], p_search => 'Zqx Overlap', "
            "p_overlap_review => 'recognises') as n"
        )[0]["n"]
        self.assertEqual(count, 1)
        self.raises(self.errors.InvalidParameterValue, self.window_ids, "located_in")

    def test_filter_keeps_nothing_for_others_and_visitors_still_list(self):
        self.assertEqual(self.window_ids("overlaps", self.other), set())
        self.assertEqual(self.window_ids(None, None), {self.a, self.b, self.rec})

    def test_kept_ids_and_extent_take_the_filter(self):
        kept = self.call(
            "select public.place_kept_ids(array['ramsar_site'], p_overlap_review => 'recognises') as ids"
        )[0]["ids"]
        self.assertIn(uuid.UUID(self.rec), kept)
        self.assertNotIn(uuid.UUID(self.b), kept)

    # The notes ---------------------------------------------------------------------------

    def test_notes(self):
        third, _ = self.place("Zqx Overlap Gamma")
        self.link(self.a, "overlaps", third, 0.7, 0.1)
        rows = self.call(
            "select place_id::text as place_id, proposed_links, top_other_name, top_share "
            "from public.overlap_review_notes(%s::uuid[])",
            ([self.a, self.b],),
        )
        notes = {r["place_id"]: r for r in rows}
        self.assertEqual(notes[self.a]["proposed_links"], 3)
        self.assertEqual(notes[self.a]["top_other_name"], "Zqx Overlap Gamma")
        self.assertAlmostEqual(notes[self.a]["top_share"], 0.7)
        # Beta is the other end of the pair: its share is the pair's share of Beta.
        share_b = self.conn.execute(
            "select case when subject_place_id = %s then subject_coverage else object_coverage end as s "
            "from public.place_relationships where id = %s", (self.b, self.pair)
        ).fetchone()["s"]
        self.assertEqual(notes[self.b]["proposed_links"], 1)
        self.assertAlmostEqual(notes[self.b]["top_share"], share_b)
        self.assertEqual(notes[self.b]["top_other_name"], "Zqx Overlap Alpha")
        # One kind only: Alpha has one proposed recognises link.
        rows = self.call(
            "select place_id::text as place_id, proposed_links "
            "from public.overlap_review_notes(%s::uuid[], 'recognises')",
            ([self.a, self.b],),
        )
        self.assertEqual({r["place_id"]: r["proposed_links"] for r in rows}, {self.a: 1})

    def test_notes_are_admin_only(self):
        self.raises(self.errors.InsufficientPrivilege, self.call,
                    "select * from public.overlap_review_notes(%s::uuid[])", ([self.a],), self.other)

    def test_decisions_are_audited(self):
        self.review(self.pair, "same_place", self.b)
        tables = {
            r["table_name"]
            for r in self.conn.execute(
                "select table_name from public.audit_log where actor = %s", (self.admin,)
            ).fetchall()
        }
        self.assertTrue({"place_relationships", "places", "place_boundaries"} <= tables)


if __name__ == "__main__":
    unittest.main()

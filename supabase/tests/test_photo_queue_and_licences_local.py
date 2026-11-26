"""The photo filter on the list reads, the purge of rejected photographs, and the CC
licences (Wayfinding task 05a), against the local database.

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
    "test_place_cleanup_local", Path(__file__).parent / "test_place_cleanup_local.py"
)
test_place_cleanup_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_place_cleanup_local)
connect = test_place_cleanup_local.connect


class PhotoQueueAndLicencesLocalTest(unittest.TestCase):
    # Borrowed, not inherited, so the cleanup tests do not run twice. It stores a
    # boundary and details, so listed_places lists the place.
    listed_place = test_place_cleanup_local.PlaceCleanupLocalTest.place

    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.park = self.place("Zqx Park")
        self.other = self.place("Zqx Other Park")
        self.admin = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str) -> str:
        return self.listed_place(name, "conservation_area")

    def user(self) -> str:
        user_id = str(uuid.uuid4())
        self.conn.execute(
            "insert into auth.users (id, aud, role, email) "
            "values (%s, 'authenticated', 'authenticated', %s)",
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

    def as_user(self, user_id: str | None, sql: str, args: tuple = ()):
        self.act_as(user_id)
        rows = self.conn.execute(sql, args).fetchall()
        self.conn.execute("reset role")
        self.conn.execute("select set_config('request.jwt.claims', '', true)")
        return rows

    def image(self, name: str, upload: bool = False) -> str:
        if upload:
            return self.conn.execute(
                "insert into public.images (storage_path, source_id, creator_name, licence_id, "
                "sha256) values (%s, 'sooty-earth-contributors', 'The admin', 'cc-by-4.0', %s) "
                "returning id::text as id",
                (f"uploads/{name}.jpg", uuid.uuid4().hex * 2),
            ).fetchone()["id"]
        return self.conn.execute(
            "insert into public.images (external_url, source_id, source_record_id, "
            "creator_name, licence_id) values (%s, 'wikimedia-commons', %s, 'A. Photographer', "
            "'cc-by-sa-4.0') returning id::text as id",
            (f"https://upload.wikimedia.org/{name}.jpg", f"File:{name}.jpg"),
        ).fetchone()["id"]

    def link(self, place: str, image: str, status: str, days_ago: int = 0) -> None:
        self.conn.execute(
            "insert into public.place_images (place_id, image_id, status, alt_text, "
            "reviewed_at) values (%s, %s, %s, 'A view', now() - make_interval(days => %s))",
            (place, image, status, days_ago),
        )

    def window(self, user_id: str | None, photos: bool) -> list[str]:
        rows = self.as_user(
            user_id,
            "select id::text from public.place_window(array['conservation_area'], "
            "p_search => 'Zqx', p_photo_suggestions => %s)",
            (photos,),
        )
        return [row["id"] for row in rows]

    def test_filter_keeps_places_with_suggestions_for_admins(self):
        self.link(self.park, self.image("Zqx one"), "suggested")
        self.link(self.other, self.image("Zqx two"), "approved")
        self.assertEqual(self.window(self.admin, True), [self.park])
        self.assertCountEqual(self.window(self.admin, False), [self.park, self.other])
        self.assertEqual(self.window(None, True), [])
        count = self.as_user(
            self.admin,
            "select public.place_window_count(array['conservation_area'], 'Zqx', "
            "p_photo_suggestions => true) as n",
        )[0]["n"]
        self.assertEqual(count, 1)
        kept = self.as_user(
            self.admin,
            "select public.place_kept_ids(array['conservation_area'], "
            "p_photo_suggestions => true) as ids",
        )[0]["ids"]
        self.assertIn(uuid.UUID(self.park), kept)
        self.assertNotIn(uuid.UUID(self.other), kept)

    def test_photo_queue_is_gone(self):
        found = self.conn.execute(
            "select count(*) as n from pg_proc where proname = 'photo_queue'"
        ).fetchone()["n"]
        self.assertEqual(found, 0)

    def test_purge_deletes_old_rejections_and_keeps_refusals(self):
        old = self.image("Zqx old")
        shared = self.image("Zqx shared")
        recent = self.image("Zqx recent")
        uploaded = self.image("zqx-upload", upload=True)
        self.link(self.park, old, "rejected", 31)
        self.link(self.park, shared, "rejected", 31)
        self.link(self.other, shared, "approved")
        self.link(self.park, recent, "rejected", 5)
        self.link(self.other, uploaded, "rejected", 40)
        self.link(self.other, old, "suggested", 40)

        result = self.as_user(self.admin, "select * from public.purge_rejected_photos()")[0]
        self.assertEqual(
            (result["links_deleted"], result["images_deleted"], result["refusals_added"]),
            (3, 0, 2),
        )
        refusals = self.conn.execute(
            "select place_id::text, commons_title from public.photo_refusals "
            "where place_id in (%s, %s) order by 2",
            (self.park, self.other),
        ).fetchall()
        self.assertEqual(
            [(r["place_id"], r["commons_title"]) for r in refusals],
            [(self.park, "File:Zqx old.jpg"), (self.park, "File:Zqx shared.jpg")],
        )
        left = {
            (r["place_id"], r["image_id"]): r["status"]
            for r in self.conn.execute(
                "select place_id::text, image_id::text, status from public.place_images "
                "where place_id in (%s, %s)",
                (self.park, self.other),
            ).fetchall()
        }
        self.assertEqual(
            left,
            {
                (self.other, shared): "approved",
                (self.park, recent): "rejected",
                (self.other, old): "suggested",
            },
        )
        images = {
            r["id"]
            for r in self.conn.execute(
                "select id::text from public.images where id = any (%s::uuid[])",
                ([old, shared, recent, uploaded],),
            ).fetchall()
        }
        # Every Commons image is still linked somewhere, and an upload's row stays.
        self.assertEqual(images, {old, shared, recent, uploaded})

    def test_purge_deletes_unused_commons_images(self):
        alone = self.image("Zqx alone")
        self.link(self.park, alone, "rejected", 31)
        result = self.as_user(self.admin, "select * from public.purge_rejected_photos()")[0]
        self.assertEqual(result["images_deleted"], 1)
        gone = self.conn.execute(
            "select count(*) as n from public.images where id = %s", (alone,)
        ).fetchone()["n"]
        self.assertEqual(gone, 0)

    def test_purge_is_for_admins(self):
        visitor = self.user()
        for user_id in (visitor, None):
            with self.conn.transaction():
                with self.assertRaises(self.errors.InsufficientPrivilege):
                    with self.conn.transaction():
                        self.as_user(user_id, "select * from public.purge_rejected_photos()")
            self.conn.execute("reset role")

    def test_refusals_are_read_by_admins_only(self):
        self.conn.execute(
            "insert into public.photo_refusals (place_id, commons_title) values (%s, %s)",
            (self.park, "File:Zqx no.jpg"),
        )
        sql = "select count(*) as n from public.photo_refusals where place_id = %s"
        self.assertEqual(self.as_user(self.admin, sql, (self.park,))[0]["n"], 1)
        self.assertEqual(self.as_user(self.user(), sql, (self.park,))[0]["n"], 0)

    def test_every_cc_by_and_by_sa_version_is_a_licence(self):
        ids = {
            r["id"]
            for r in self.conn.execute("select id from public.licences").fetchall()
        }
        for kind in ("by", "by-sa"):
            for version in ("1.0", "2.0", "2.5", "3.0", "4.0"):
                self.assertIn(f"cc-{kind}-{version}", ids)
            for port in ("1.0-nl", "2.0-uk", "2.1-jp", "2.5-scotland", "3.0-de", "3.0-igo"):
                self.assertIn(f"cc-{kind}-{port}", ids)
        row = self.conn.execute(
            "select title, url, share_alike from public.licences where id = 'cc-by-sa-3.0-de'"
        ).fetchone()
        self.assertEqual(row["title"], "Creative Commons Attribution-ShareAlike 3.0 Germany")
        self.assertEqual(row["url"], "https://creativecommons.org/licenses/by-sa/3.0/de/")
        self.assertTrue(row["share_alike"])
        # 8 generic versions were stored before; 1.0 adds 2, and the ports 192.
        self.assertEqual(len([i for i in ids if i.startswith("cc-by")]), 8 + 2 + 192)


if __name__ == "__main__":
    unittest.main()

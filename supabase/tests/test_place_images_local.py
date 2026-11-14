"""Photographs of places and their admin RPCs, against the local database.

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

SHA = "ab" * 32


def commons(name: str = "Zqx falls.jpg", **extra) -> dict:
    return {
        "external_url": f"https://upload.wikimedia.org/wikipedia/commons/a/ab/{name}",
        "source_id": "wikimedia-commons",
        "source_record_id": f"File:{name}",
        "source_url": f"https://commons.wikimedia.org/wiki/File:{name}",
        "creator_name": "A. Photographer",
        "licence_id": "cc-by-sa-4.0",
        "width": 4000,
        "height": 3000,
        "alt_text": "A waterfall over dark rock",
        **extra,
    }


def upload(sha: str = SHA, **extra) -> dict:
    return {
        "storage_path": f"uploads/{sha}.jpg",
        "source_id": "sooty-earth-contributors",
        "creator_name": "The admin",
        "licence_id": "cc-by-4.0",
        "sha256": sha,
        "width": 1600,
        "height": 1200,
        "alt_text": "Grassland at dusk",
        **extra,
    }


class PlaceImagesLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
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
        return self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'conservation_area', 'published') returning id::text as id",
            (name,),
        ).fetchone()["id"]

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
        """Switch to the role PostgREST would use, with that user's JWT claims."""
        self.conn.execute("reset role")
        if user_id is None:
            self.conn.execute("select set_config('request.jwt.claims', '', true)")
            self.conn.execute("set local role anon")
            return
        claims = json.dumps({"sub": user_id, "role": "authenticated"})
        self.conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        self.conn.execute("set local role authenticated")

    def call(self, sql: str, args: tuple, user_id: str | None = "admin"):
        self.act_as(self.admin if user_id == "admin" else user_id)
        rows = self.conn.execute(sql, args).fetchall()
        self.conn.execute("reset role")
        return rows

    def add(self, place: str, image: dict, user_id: str | None = "admin") -> dict:
        return self.call(
            """
            select image_id::text as image_id, status, is_primary, gallery_position,
                   alt_text, caption, reviewed_by::text as reviewed_by
            from public.add_place_image(%s, %s::jsonb)
            """,
            (place, json.dumps(image)),
            user_id,
        )[0]

    def set(self, place: str, image_id: str, values: dict) -> dict:
        return self.call(
            "select status, is_primary, gallery_position "
            "from public.set_place_image(%s, %s, %s::jsonb)",
            (place, image_id, json.dumps(values)),
        )[0]

    def order(self, place: str, ids: list[str]):
        return self.call(
            "select image_id from public.order_place_images(%s, %s::uuid[])", (place, ids)
        )

    def raises(self, error, fn, *args):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            fn(*args)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def positions(self, place: str) -> dict:
        rows = self.conn.execute(
            "select image_id::text as id, gallery_position as p, is_primary "
            "from public.place_images where place_id = %s",
            (place,),
        ).fetchall()
        return {r["id"]: (r["p"], r["is_primary"]) for r in rows}

    def visible(self, user_id: str | None, table: str = "place_images") -> int:
        self.act_as(user_id)
        n = self.conn.execute(f"select count(*) as n from public.{table}").fetchone()["n"]
        self.conn.execute("reset role")
        return n

    def test_only_an_admin_adds_or_reviews(self):
        stranger = self.user()
        for who in (None, stranger):
            self.raises(self.errors.InsufficientPrivilege, self.add, self.park, commons(), who)
        link = self.add(self.park, commons())
        for who in (None, stranger):
            self.conn.execute("savepoint s")
            with self.assertRaises(self.errors.InsufficientPrivilege):
                self.call(
                    "select public.set_place_image(%s, %s, '{\"status\": \"rejected\"}')",
                    (self.park, link["image_id"]),
                    who,
                )
            self.conn.execute("rollback to savepoint s")
            self.conn.execute("reset role")

    def test_visitors_read_only_approved_links_of_published_places(self):
        link = self.add(self.park, commons())
        rejected = self.add(self.park, commons("Zqx dusk.jpg"))
        self.set(self.park, rejected["image_id"], {"status": "rejected"})
        self.conn.execute(
            "update public.place_images set status = 'suggested' where image_id = %s",
            (self.add(self.park, upload())["image_id"],),
        )
        self.assertEqual(self.visible(None), 1)
        self.assertEqual(self.visible(self.user()), 1)
        self.assertEqual(self.visible(None, "images"), 1)
        self.assertEqual(self.visible(self.admin), 3)
        self.assertEqual(self.visible(self.admin, "images"), 3)
        self.conn.execute(
            "update public.places set publication_status = 'draft' where id = %s", (self.park,)
        )
        self.assertEqual(self.visible(None), 0)
        self.assertEqual(self.visible(None, "images"), 0)
        self.assertTrue(link["image_id"])

    def test_an_added_photograph_is_approved_and_last(self):
        first = self.add(self.park, commons())
        second = self.add(self.park, upload())
        self.assertEqual(
            {k: first[k] for k in ("status", "is_primary", "gallery_position", "reviewed_by")},
            {"status": "approved", "is_primary": False, "gallery_position": 1,
             "reviewed_by": self.admin},
        )
        self.assertEqual(second["gallery_position"], 2)
        uploaded_by = self.conn.execute(
            "select uploaded_by::text as u from public.images where id = %s",
            (second["image_id"],),
        ).fetchone()["u"]
        self.assertEqual(uploaded_by, self.admin)

    def test_the_same_file_is_stored_once(self):
        a = self.add(self.park, commons())
        b = self.add(self.other, commons(alt_text="Same falls"))
        self.assertEqual(a["image_id"], b["image_id"])
        c = self.add(self.park, upload())
        d = self.add(self.other, upload(storage_path="uploads/other.jpg"))
        self.assertEqual(c["image_id"], d["image_id"])
        n = self.conn.execute("select count(*) as n from public.images").fetchone()["n"]
        self.assertGreaterEqual(n, 2)
        self.raises(self.errors.UniqueViolation, self.add, self.park, commons())

    def test_bad_images_raise(self):
        bad = self.errors.InvalidParameterValue
        self.raises(bad, self.add, self.park, commons(licence_id="cc-by-nc-4.0"))
        self.raises(bad, self.add, self.park, commons(source_id="flickr"))
        self.raises(bad, self.add, self.park, commons(alt_text=" "))
        self.raises(bad, self.add, self.park, commons(colour="red"))
        self.raises(
            self.errors.CheckViolation, self.add, self.park, upload(external_url="https://x.test/a.jpg")
        )
        self.raises(self.errors.NoDataFound, self.add, str(uuid.uuid4()), commons())

    def test_one_main_photograph_per_place(self):
        a = self.add(self.park, commons())["image_id"]
        b = self.add(self.park, upload())["image_id"]
        self.set(self.park, a, {"is_primary": True})
        self.set(self.park, b, {"is_primary": True})
        self.assertEqual(self.positions(self.park)[a][1], False)
        self.assertEqual(self.positions(self.park)[b][1], True)
        row = self.set(self.park, b, {"status": "rejected"})
        self.assertEqual((row["is_primary"], row["gallery_position"]), (False, None))
        self.raises(
            self.errors.InvalidParameterValue, self.set, self.park, b, {"is_primary": True}
        )
        row = self.set(self.park, b, {"status": "approved"})
        self.assertEqual(row["gallery_position"], 2)

    def test_ordering_lists_each_approved_photograph_once(self):
        a = self.add(self.park, commons())["image_id"]
        b = self.add(self.park, upload())["image_id"]
        c = self.add(self.park, commons("Zqx dusk.jpg"))["image_id"]
        self.order(self.park, [c, a, b])
        self.assertEqual(
            {k: v[0] for k, v in self.positions(self.park).items()}, {c: 1, a: 2, b: 3}
        )
        bad = self.errors.InvalidParameterValue
        self.raises(bad, self.order, self.park, [c, a])
        self.raises(bad, self.order, self.park, [c, a, b, str(uuid.uuid4())])
        self.raises(bad, self.order, self.park, [c, a, a])

    def test_linking_a_stored_photograph_copies_its_text(self):
        image = self.add(self.park, commons(caption="Upper falls"))["image_id"]
        row = self.call(
            "select alt_text, caption, status from public.link_place_image(%s, %s)",
            (self.other, image),
        )[0]
        self.assertEqual(
            row, {"alt_text": "A waterfall over dark rock", "caption": "Upper falls",
                  "status": "approved"}
        )

    def test_only_an_admin_writes_to_the_bucket(self):
        insert = (
            "insert into storage.objects (bucket_id, name, owner_id) "
            "values ('place-images', %s, %s)"
        )
        for who in (None, self.user()):
            self.conn.execute("savepoint s")
            with self.assertRaises(self.errors.InsufficientPrivilege):
                self.call(insert, (f"uploads/{uuid.uuid4()}.jpg", who), who)
            self.conn.execute("rollback to savepoint s")
            self.conn.execute("reset role")
        self.act_as(self.admin)
        self.conn.execute(insert, ("uploads/zqx.jpg", self.admin))
        self.conn.execute("reset role")
        bucket = self.conn.execute(
            "select public, file_size_limit from storage.buckets where id = 'place-images'"
        ).fetchone()
        self.assertEqual((bucket["public"], bucket["file_size_limit"]), (True, 10485760))

    def test_each_call_is_audited_with_the_actor(self):
        image = self.add(self.park, commons())["image_id"]
        self.set(self.park, image, {"is_primary": True})
        rows = self.conn.execute(
            """
            select table_name, action, actor::text as actor
            from public.audit_log
            where row_id in (%s, %s)
            order by id
            """,
            (image, f"{self.park}/{image}"),
        ).fetchall()
        self.assertEqual(
            rows,
            [
                {"table_name": "images", "action": "insert", "actor": self.admin},
                {"table_name": "place_images", "action": "insert", "actor": self.admin},
                {"table_name": "place_images", "action": "update", "actor": self.admin},
            ],
        )


if __name__ == "__main__":
    unittest.main()

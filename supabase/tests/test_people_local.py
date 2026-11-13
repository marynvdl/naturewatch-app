"""Profiles, roles, and the audit log, against the local database.

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


class PeopleLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect()

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
        """Switch to the role PostgREST would use, with that user's JWT claims."""
        self.conn.execute("reset role")
        if user_id is None:
            self.conn.execute("select set_config('request.jwt.claims', '', true)")
            self.conn.execute("set local role anon")
            return
        claims = json.dumps({"sub": user_id, "role": "authenticated"})
        self.conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        self.conn.execute("set local role authenticated")

    def has_admin(self, user_id: str) -> bool:
        self.act_as(user_id)
        value = self.conn.execute("select public.has_role('admin') as v").fetchone()["v"]
        self.conn.execute("reset role")
        return value

    def test_a_new_user_gets_a_profile(self):
        user_id = self.user()
        row = self.conn.execute(
            "select display_name from public.profiles where id = %s", (user_id,)
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertIsNone(row["display_name"])

    def test_has_role_follows_the_grant(self):
        user_id = self.user()
        self.assertFalse(self.has_admin(user_id))
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (user_id,)
        )
        self.assertTrue(self.has_admin(user_id))

    def test_anon_reads_nothing(self):
        import psycopg

        self.act_as(None)
        for table in ("profiles", "user_roles", "audit_log"):
            with self.subTest(table=table):
                self.conn.execute("savepoint s")
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    self.conn.execute(f"select * from public.{table}")
                self.conn.execute("rollback to savepoint s")
        self.conn.execute("savepoint s")
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            self.conn.execute("select public.has_role('admin')")
        self.conn.execute("rollback to savepoint s")

    def test_a_user_reads_only_their_own_rows(self):
        me, other = self.user(), self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'editor'), (%s, 'admin')",
            (me, other),
        )
        self.act_as(me)
        roles = self.conn.execute("select user_id::text, role from public.user_roles").fetchall()
        profiles = self.conn.execute("select id::text from public.profiles").fetchall()
        audit = self.conn.execute("select count(*) as n from public.audit_log").fetchone()["n"]
        self.assertEqual(roles, [{"user_id": me, "role": "editor"}])
        self.assertEqual(profiles, [{"id": me}])
        self.assertEqual(audit, 0)

    def test_an_admin_reads_the_audit_log(self):
        admin = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (admin,)
        )
        self.act_as(admin)
        audit = self.conn.execute(
            "select count(*) as n from public.audit_log where row_id = %s", (f"{admin}/admin",)
        ).fetchone()["n"]
        self.assertEqual(audit, 1)

    def test_grant_and_revoke_are_audited(self):
        user_id = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (user_id,)
        )
        self.conn.execute("delete from public.user_roles where user_id = %s", (user_id,))
        rows = self.conn.execute(
            """
            select action, actor, old_values ->> 'role' as old_role, new_values ->> 'role' as new_role
            from public.audit_log
            where table_name = 'user_roles' and row_id = %s
            order by id
            """,
            (f"{user_id}/admin",),
        ).fetchall()
        self.assertEqual(
            rows,
            [
                {"action": "insert", "actor": None, "old_role": None, "new_role": "admin"},
                {"action": "delete", "actor": None, "old_role": "admin", "new_role": None},
            ],
        )


if __name__ == "__main__":
    unittest.main()

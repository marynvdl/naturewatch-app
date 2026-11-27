"""The boundary QC measures and outcomes, without a database."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "check_boundaries", Path(__file__).resolve().parents[1] / "check_boundaries.py"
)
check_boundaries = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = check_boundaries
_spec.loader.exec_module(check_boundaries)

T = check_boundaries.Thresholds(
    part_km2=0.01, min_parts=3, small_share=0.5, hole_km2=0.001, min_holes=2, tiny_share=0.5
)


def wkb(text: str) -> bytes:
    import shapely

    return shapely.to_wkb(shapely.from_wkt(text))


def square(x: float, y: float, size: float) -> str:
    return f"(({x} {y}, {x + size} {y}, {x + size} {y + size}, {x} {y + size}, {x} {y}))"


# About 0.0001° is 11 m, so a square of that side is about 0.0001 km².
BIG = square(30, -20, 0.2)
TINY = [square(31 + i, -20, 0.0001) for i in range(4)]


class MeasureTest(unittest.TestCase):
    def setUp(self):
        self.project = check_boundaries.Projector()

    def measure(self, text: str) -> dict:
        return check_boundaries.measure(wkb(text), self.project)

    def test_one_square(self):
        m = self.measure(f"MULTIPOLYGON({BIG})")
        self.assertTrue(m["valid"])
        self.assertEqual(m["valid_reason"], "")
        self.assertEqual((m["parts"], m["holes"], m["vertices"]), (1, 0, 5))
        self.assertEqual(m["parts_lt"], [0] * len(check_boundaries.SIZE_EDGES_KM2))

    def test_small_parts_are_counted_by_size(self):
        m = self.measure("MULTIPOLYGON(" + ",".join([BIG] + TINY) + ")")
        self.assertEqual(m["parts"], 5)
        edges = check_boundaries.SIZE_EDGES_KM2
        self.assertEqual(m["parts_lt"][edges.index(0.001)], 4)
        self.assertEqual(m["parts_lt"][edges.index(0.0001)], 0)
        self.assertEqual(m["parts_lt"][edges.index(100.0)], 4)

    def test_holes_are_counted_by_size(self):
        holes = ", ".join(square(30.05 + 0.02 * i, -19.9, 0.0001)[1:-1] for i in range(3))
        m = self.measure(f"POLYGON({BIG[1:-1]}, {holes})")
        self.assertEqual(m["holes"], 3)
        self.assertEqual(m["holes_lt"][check_boundaries.SIZE_EDGES_KM2.index(0.001)], 3)

    def test_bowtie_is_invalid(self):
        m = self.measure("POLYGON((30 -20, 30.1 -20.1, 30.1 -20, 30 -20.1, 30 -20))")
        self.assertFalse(m["valid"])
        self.assertIn("Self-intersection", m["valid_reason"])
        self.assertGreaterEqual(m["parts"], 1)

    def test_row_round_trip(self):
        m = self.measure("MULTIPOLYGON(" + ",".join([BIG] + TINY) + ")")
        row = dict(zip(check_boundaries.COLUMNS, check_boundaries.to_row("b1", "ramsar_site", m)))
        back = check_boundaries.from_row(row)
        self.assertEqual(back["place_type_id"], "ramsar_site")
        for key in ("valid", "vertices", "parts", "holes", "parts_lt", "holes_lt"):
            self.assertEqual(back[key], m[key])

    def test_read_measures_needs_a_file(self):
        with tempfile.TemporaryDirectory() as work, self.assertRaises(SystemExit):
            check_boundaries.read_measures(Path(work))


def measures(**overrides) -> dict:
    n = len(check_boundaries.SIZE_EDGES_KM2)
    base = {"valid": True, "valid_reason": "", "vertices": 100, "parts": 1, "holes": 0,
            "parts_lt": [0] * n, "holes_lt": [0] * n}
    base.update(overrides)
    return base


class OutcomesTest(unittest.TestCase):
    edges = check_boundaries.SIZE_EDGES_KM2

    def by_id(self, m: dict, cap: int = 1000):
        checks, status, eligible = check_boundaries.outcomes(m, T, cap)
        return {c["check_id"]: c for c in checks}, status, eligible

    def test_clean_boundary_passes_and_is_eligible(self):
        checks, status, eligible = self.by_id(measures())
        self.assertEqual(list(checks), ["geometry_valid", "small_components", "holes", "vertex_count"])
        self.assertTrue(all(c["outcome"] == "pass" for c in checks.values()))
        self.assertEqual((status, eligible), ("passed", True))

    def test_invalid_fails_and_flags(self):
        checks, status, eligible = self.by_id(measures(valid=False, valid_reason="Self-intersection"))
        self.assertEqual(checks["geometry_valid"]["outcome"], "fail")
        self.assertEqual(checks["geometry_valid"]["details"], {"reason": "Self-intersection"})
        self.assertEqual((status, eligible), ("flagged", False))

    def test_many_small_parts_warn(self):
        lt = [0] * len(self.edges)
        lt[self.edges.index(0.01)] = 3
        checks, status, eligible = self.by_id(measures(parts=4, parts_lt=lt))
        self.assertEqual(checks["small_components"]["outcome"], "warn")
        self.assertEqual(checks["small_components"]["measured_value"], 0.75)
        self.assertEqual(checks["small_components"]["threshold_used"], 0.5)
        self.assertEqual(checks["small_components"]["details"]["small_parts"], 3)
        self.assertEqual((status, eligible), ("flagged", False))

    def test_few_parts_do_not_warn_however_small(self):
        lt = [0] * len(self.edges)
        lt[self.edges.index(0.01)] = 2
        checks, status, _ = self.by_id(measures(parts=2, parts_lt=lt))
        self.assertEqual(checks["small_components"]["outcome"], "pass")
        self.assertEqual(status, "passed")

    def test_many_tiny_holes_warn(self):
        lt = [0] * len(self.edges)
        lt[self.edges.index(0.001)] = 2
        checks, status, _ = self.by_id(measures(holes=2, holes_lt=lt))
        self.assertEqual(checks["holes"]["outcome"], "warn")
        self.assertEqual(status, "flagged")

    def test_vertex_cap_warns_without_flagging(self):
        checks, status, eligible = self.by_id(measures(vertices=1001))
        self.assertEqual(checks["vertex_count"]["outcome"], "warn")
        self.assertEqual(checks["vertex_count"]["check_category"], "processing_cost")
        self.assertEqual((status, eligible), ("passed", False))

    def test_every_threshold_size_is_an_edge(self):
        for t in [check_boundaries.DEFAULT_THRESHOLDS, *check_boundaries.THRESHOLDS.values()]:
            self.assertIn(t.part_km2, self.edges)
            self.assertIn(t.hole_km2, self.edges)


if __name__ == "__main__":
    unittest.main()

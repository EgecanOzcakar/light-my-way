from datetime import datetime, timezone

from cli.routing import RouteResult
from cli.schedule import sample_checkpoints

ROUTE = RouteResult(
    polyline=[(0.0, 0.0), (0.0, 1.0)],
    distance_m=111_000,
    duration_s=3600,
    approximate=False,
)
START = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)


def test_brackets_with_origin_and_destination():
    cps = sample_checkpoints(ROUTE, START, 30, "A", "B")
    assert cps[0]["kind"] == "origin"
    assert cps[-1]["kind"] == "destination"
    assert cps[0]["label"] == "A"
    assert cps[-1]["label"] == "B"


def test_interval_checkpoint_present():
    cps = sample_checkpoints(ROUTE, START, 30, "A", "B")
    assert any(c["kind"] == "interval" and c["offset_min"] == 30 for c in cps)
    assert cps[-1]["offset_min"] == 60


def test_no_interval_points_when_interval_exceeds_duration():
    cps = sample_checkpoints(ROUTE, START, 120, "A", "B")
    assert len(cps) == 2


def test_cumulative_km():
    cps = sample_checkpoints(ROUTE, START, 30, "A", "B")
    assert cps[0]["cumulative_km"] == 0
    assert round(cps[-1]["cumulative_km"]) == 111

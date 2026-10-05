import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in ("TYPESAFE_API_KEY", "TYPESAFE_DEFAULT_MODEL", "JEV_MODE", "JEV_MODEL", "JEV_MOCK_WRITE", "ESPN_MY_TEAM_ID"):
        monkeypatch.delenv(name, raising=False)


def iso(hours_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


class FakeQuery:
    """Just enough of the supabase-py query builder for judge_news: select/gte/eq/in_/order/limit/execute."""

    def __init__(self, rows):
        self.rows = [dict(r) for r in rows]

    def select(self, *a, **k):
        return self

    def gte(self, col, val):
        self.rows = [r for r in self.rows if str(r.get(col)) >= str(val)]
        return self

    def eq(self, col, val):
        self.rows = [r for r in self.rows if str(r.get(col)) == str(val)]
        return self

    def in_(self, col, vals):
        vals = {str(v) for v in vals}
        self.rows = [r for r in self.rows if str(r.get(col)) in vals]
        return self

    def order(self, col, desc=False):
        self.rows.sort(key=lambda r: r.get(col), reverse=desc)
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))

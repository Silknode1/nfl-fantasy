"""ESPN news payload -> rows, plus the gate that decides which items are worth a Jev call.

Endpoint: https://site.api.espn.com/apis/site/v2/sports/football/nfl/news (unofficial, no auth).
Each article carries `categories`; entries of type "athlete" name the tagged players (athleteId maps to
players.espn_id) and entries of type "team" carry the team abbreviation. Identity therefore comes from
tags in code, never from asking Jev who an article is about.

Caveat found while building: tags are article-level. Training-camp roundups tag 5-10 athletes with a
one-line generic description, so they carry almost no per-player text. The eligibility gate drops items
that tag more than settings.MAX_ATHLETES_PER_ITEM players. HeadlineNews items ("Sources: ...") are the
useful ones.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from . import settings
from .state import canon_team, clean_text


def _athlete_id(cat: dict) -> str | None:
    aid = cat.get("athleteId")
    if aid is None:
        aid = (cat.get("athlete") or {}).get("id")
    return str(aid) if aid not in (None, "") else None


def parse_articles(payload: dict) -> list[dict]:
    """Rows for the news_items table. Articles without an id or headline are dropped."""
    rows = []
    for art in payload.get("articles", []) or []:
        art_id, headline = art.get("id"), (art.get("headline") or "").strip()
        if art_id in (None, "") or not headline:
            continue
        athletes, teams = [], []
        for cat in art.get("categories", []) or []:
            if cat.get("type") == "athlete":
                aid = _athlete_id(cat)
                if aid and aid not in athletes:
                    athletes.append(aid)
            elif cat.get("type") == "team":
                abbr = (cat.get("team") or {}).get("abbreviation")
                if abbr and canon_team(abbr) not in teams:
                    teams.append(canon_team(abbr))
        body = (art.get("description") or "").strip()
        rows.append(
            {
                "news_id": f"espn:{art_id}",
                "source": "espn",
                "source_type": art.get("type") or "unknown",
                "headline": headline,
                "body": body,
                "url": ((art.get("links") or {}).get("web") or {}).get("href"),
                "published_at": art.get("published"),
                "espn_athlete_ids": athletes,
                "team_abbrs": teams,
                "content_hash": hashlib.sha1(f"{headline}|{body}".lower().encode()).hexdigest(),
                "data": {"byline": art.get("byline"), "last_modified": art.get("lastModified")},
            }
        )
    return rows


def parse_ts(value) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def newest_age_hours(rows: list[dict], now: datetime | None = None) -> float | None:
    now = now or datetime.now(timezone.utc)
    stamps = [t for t in (parse_ts(r.get("published_at")) for r in rows) if t]
    return (now - max(stamps)).total_seconds() / 3600 if stamps else None


def item_text(row: dict) -> str:
    """The text Jev reads: headline plus description. Hedging and attribution live in these words."""
    head, body = (row.get("headline") or "").strip(), (row.get("body") or "").strip()
    return clean_text(f"{head}. {body}" if body and body != head else head)


def eligible(row: dict, now: datetime | None = None) -> tuple[bool, str]:
    """Cheap deterministic gate in front of the paid call. Returns (ok, reason)."""
    now = now or datetime.now(timezone.utc)
    ts = parse_ts(row.get("published_at"))
    if ts is None:
        return False, "no_timestamp"
    if (now - ts).total_seconds() / 3600 > settings.MAX_AGE_HOURS:
        return False, "too_old"
    n = len(row.get("espn_athlete_ids") or [])
    if n == 0:
        return False, "no_athlete_tag"
    if n > settings.MAX_ATHLETES_PER_ITEM:
        return False, "multi_player_story"
    if len(item_text(row)) < settings.MIN_TEXT_CHARS:
        return False, "too_short"
    return True, "ok"

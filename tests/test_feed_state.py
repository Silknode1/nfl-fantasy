from datetime import datetime, timedelta, timezone

import pytest

from jev_signals import settings
from jev_signals.feed import eligible, item_text, newest_age_hours, parse_articles
from jev_signals.state import CANONICAL_TEAMS, build_state, canon_team, clean_text, resolve_player, role_bucket

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def article(aid, headline, athletes=(), teams=(), published="2026-10-03T10:00:00Z", typ="HeadlineNews", description="Details inside."):
    cats = [{"type": "league", "description": "NFL"}]
    cats += [{"type": "athlete", "athleteId": a, "description": f"p{a}", "athlete": {"id": a}} for a in athletes]
    cats += [{"type": "team", "teamId": 1, "description": t, "team": {"abbreviation": t}} for t in teams]
    return {"id": aid, "headline": headline, "description": description, "published": published, "type": typ,
            "categories": cats, "links": {"web": {"href": f"https://espn.test/{aid}"}}, "byline": "Staff"}


def test_parse_articles_extracts_tags_and_canonical_teams():
    rows = parse_articles({"articles": [
        article(1, "Sources: Commanders LT out", athletes=["3051890"], teams=["WSH"]),
        {"id": None, "headline": "no id"},  # dropped
        {"id": 3, "headline": "  "},  # dropped
        article(4, "Dup tags", athletes=["9", "9", "8"]),
    ]})
    assert [r["news_id"] for r in rows] == ["espn:1", "espn:4"]
    assert rows[0]["espn_athlete_ids"] == ["3051890"] and rows[0]["team_abbrs"] == ["WAS"]  # WSH -> WAS
    assert rows[1]["espn_athlete_ids"] == ["9", "8"]
    assert rows[0]["url"] == "https://espn.test/1" and len(rows[0]["content_hash"]) == 40


def test_athlete_id_falls_back_to_nested_object():
    payload = {"articles": [{"id": 5, "headline": "x" * 40, "categories": [{"type": "athlete", "athlete": {"id": 77}}]}]}
    assert parse_articles(payload)[0]["espn_athlete_ids"] == ["77"]


def test_content_hash_ignores_case_so_reposts_dedupe():
    a, b = parse_articles({"articles": [article(1, "Vale OUT", description="Rule"), article(2, "vale out", description="rule")]})
    assert a["content_hash"] == b["content_hash"]


@pytest.mark.parametrize(
    "kwargs,reason",
    [
        (dict(athletes=["1"]), "ok"),
        (dict(athletes=[]), "no_athlete_tag"),
        (dict(athletes=["1", "2", "3", "4"]), "multi_player_story"),
        (dict(athletes=["1"], published="2026-09-25T10:00:00Z"), "too_old"),
        (dict(athletes=["1"], published=None), "no_timestamp"),
    ],
)
def test_eligibility_gate(kwargs, reason):
    row = parse_articles({"articles": [article(1, "A headline long enough to count as text", **kwargs)]})[0]
    assert eligible(row, NOW) == (reason == "ok", reason)


def test_too_short_text_is_not_worth_a_call():
    row = parse_articles({"articles": [article(1, "Vale out", athletes=["1"], description="")]})[0]
    assert eligible(row, NOW) == (False, "too_short")


def test_item_text_joins_headline_and_description():
    assert item_text({"headline": "Vale ruled out", "body": "The team said Friday."}) == "Vale ruled out. The team said Friday."
    assert item_text({"headline": "Same", "body": "Same"}) == "Same"


def test_newest_age():
    rows = [{"published_at": "2026-10-03T08:00:00Z"}, {"published_at": "2026-10-01T08:00:00Z"}, {"published_at": "junk"}]
    assert newest_age_hours(rows, NOW) == pytest.approx(4.0)
    assert newest_age_hours([], NOW) is None


@pytest.mark.parametrize("raw,want", [("WSH", "WAS"), ("LAR", "LA"), ("RAM", "LA"), ("GBP", "GB"), ("KCC", "KC"), ("JAC", "JAX"),
                                       ("LVR", "LV"), ("OAK", "LV"), ("SDC", "LAC"), ("FA*", "FA"), (None, "FA"), ("None", "FA"), ("DAL", "DAL")])
def test_team_codes_normalize_to_schedules_style(raw, want):
    assert canon_team(raw) == want


def test_every_legacy_code_seen_in_the_live_tables_lands_on_a_real_team():
    seen = "GBP JAC KCC LVR NEP NOS SFO TBB LAR RAM OAK SDC STL WSH".split()  # from players.team / rosters, Oct 2026
    assert all(canon_team(c) in CANONICAL_TEAMS for c in seen)
    assert len(CANONICAL_TEAMS) == 32


def test_resolve_player_prefers_rostered_and_refuses_ambiguity():
    wr = {"player_id": "a", "full_name": "A", "position": "WR", "team": "KCC"}
    fa = {"player_id": "b", "full_name": "A", "position": "WR", "team": "FA"}
    ol = {"player_id": "c", "full_name": "C", "position": "OL", "team": "DAL"}
    assert resolve_player([wr]) == (wr, "ok")
    assert resolve_player([fa, wr]) == (wr, "ok")  # shared espn_id: the rostered player wins
    assert resolve_player([wr, {**wr, "player_id": "d", "team": "DET"}]) == (None, "ambiguous_espn_id")
    assert resolve_player([ol]) == (None, "not_fantasy_position")
    assert resolve_player([]) == (None, "not_fantasy_position")


@pytest.mark.parametrize("pos,pct,label", [("RB", 0.7, "lead running back"), ("RB", 0.4, "committee running back"), ("RB", 0.0, "reserve running back"),
                                            ("WR", 0.85, "every-down wide receiver"), ("TE", 0.5, "rotational tight end"),
                                            ("QB", 0.9, "starting quarterback"), ("QB", 0.1, "backup quarterback"), ("WR", None, "role unknown"), ("K", 0.5, "role unknown")])
def test_role_bucket_returns_words_not_numbers(pos, pct, label):
    assert role_bucket(pos, pct) == label


def test_state_contains_only_what_the_questions_name_and_no_raw_numbers():
    player = {"player_id": "x", "full_name": "Jordan Vale", "position": "WR", "team": "KCC", "espn_id": "1", "pfr_id": "ValeJo00"}
    st = build_state(player, "  Vale   ruled out.\n\n", "HeadlineNews", "rotational wide receiver")
    assert st == {"player": {"name": "Jordan Vale", "team": "KC", "position": "WR", "baseline_role": "rotational wide receiver"},
                  "item": {"source_type": "HeadlineNews", "text": "Vale ruled out."}}  # no ids, no snap percentages
    assert "context" not in st and "context" in build_state(player, "t", "n", "r", teammates_out=["B"])


def test_clean_text_caps_length():
    assert len(clean_text("x " * 5000)) == 1500
    assert settings.MAX_ATHLETES_PER_ITEM == 3

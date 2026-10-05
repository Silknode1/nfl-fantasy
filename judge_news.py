"""Run the Jev question set over fresh news items and store the judgments in `jev_judgments`.

  python judge_news.py                 # judge new items (needs TYPESAFE_API_KEY)
  python judge_news.py --dry-run       # judge and print, write nothing
  python judge_news.py --limit 20      # cap the number of Jev calls this run
  JEV_MODE=mock python judge_news.py   # offline heuristics; always a dry run unless JEV_MOCK_WRITE=1

Flow: eligible items (fresh, 1-3 tagged athletes) -> resolve each tagged athlete to a player in code ->
bucket his recent snap share into a role phrase -> ask Jev -> interpret under code-owned thresholds ->
route an alert tier -> upsert. Jev never decides who an item is about; the ESPN tags and the players table do.
"""
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

from config import SEASON, supabase_client, upsert
from jev_signals import settings
from jev_signals.client import JevClient
from jev_signals.feed import eligible
from jev_signals.pipeline import estimated_cost_usd, judge_pair
from jev_signals.state import BENCH_SLOTS, resolve_player, role_bucket

MOCK_MODEL = "mock-heuristic"
CHUNK = 100  # keep PostgREST `in` filters well under URL length limits


def _chunks(seq, n=CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def _fresh_items(c):
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=settings.MAX_AGE_HOURS)).isoformat()
    return (
        c.table("news_items").select("*").gte("published_at", cutoff).order("published_at", desc=True).limit(500).execute().data
    )


def _already_judged(c, news_ids):
    """(news_id, espn_id) pairs with a real judgment under the current question set. Mock rows do not count."""
    done = set()
    for chunk in _chunks(news_ids):
        rows = (
            c.table("jev_judgments")
            .select("news_id,espn_id,model")
            .in_("news_id", chunk)
            .eq("question_set", settings.QUESTION_SET)
            .execute()
            .data
        )
        done |= {(r["news_id"], r["espn_id"]) for r in rows if r["model"] != MOCK_MODEL}
    return done


def _players_by_espn_id(c, espn_ids):
    by_id = {}
    for chunk in _chunks(espn_ids):
        rows = (
            c.table("players")
            .select("player_id,full_name,position,team,espn_id,pfr_id:data->>pfr_id")
            .in_("espn_id", chunk)
            .execute()
            .data
        )
        for r in rows:
            by_id.setdefault(str(r["espn_id"]), []).append(r)
    return by_id


def _avg_offense_pct(c, pfr_id):
    """Mean offensive snap share over his last 3 games this season (snap_counts is keyed by PFR id)."""
    if not pfr_id:
        return None
    rows = (
        c.table("snap_counts").select("week,data").eq("player_id", pfr_id).eq("season", SEASON).order("week", desc=True).limit(3).execute().data
    )
    vals = [float(r["data"]["offense_pct"]) for r in rows if (r.get("data") or {}).get("offense_pct") is not None]
    return sum(vals) / len(vals) if vals else None


def _my_slots(c):
    """espn_id -> lineup slot on my ESPN team, or {} when ESPN_MY_TEAM_ID / league rosters are unavailable."""
    team_id = os.getenv("ESPN_MY_TEAM_ID")
    if not team_id:
        return {}
    rows = c.table("espn_league_rosters").select("data").eq("season", SEASON).eq("team_id", int(team_id)).execute().data
    players = (rows[0]["data"].get("players") if rows else None) or []
    return {str(p["espn_id"]): str(p.get("lineup_slot") or "").upper() for p in players if p.get("espn_id") is not None}


def run(limit=None, dry_run=False):
    m = settings.mode()
    if m == "off":
        print("  jev: skipped (set TYPESAFE_API_KEY, or JEV_MODE=mock for an offline dry run)")
        return
    if m == "mock" and os.getenv("JEV_MOCK_WRITE") != "1":
        dry_run = True  # a mock judgment in the table is indistinguishable from a real one to a casual reader
    cap = min(limit or settings.MAX_JUDGMENTS_PER_RUN, settings.MAX_JUDGMENTS_PER_RUN)

    c = supabase_client()
    items = _fresh_items(c)
    done = _already_judged(c, [i["news_id"] for i in items])
    skips, rows, errors = Counter(), [], 0

    todo = []
    for item in items:
        ok, why = eligible(item)
        if not ok:
            skips[why] += 1
            continue
        todo.extend((item, str(aid)) for aid in item["espn_athlete_ids"] if (item["news_id"], str(aid)) not in done)
    players = _players_by_espn_id(c, sorted({aid for _, aid in todo}))
    slots = _my_slots(c)

    with JevClient(mode=m) as client:
        for item, aid in todo:
            if len(rows) >= cap:
                skips["run_cap"] += 1
                continue
            player, why = resolve_player(players.get(aid, []))
            if player is None:
                skips[why] += 1
                continue
            baseline = role_bucket(player["position"], _avg_offense_pct(c, player.get("pfr_id")))
            slot = slots.get(aid)
            try:
                rows.append(judge_pair(client, item, aid, player, baseline, is_my_starter=bool(slot) and slot not in BENCH_SLOTS))
            except Exception as e:  # one bad call should not sink the batch; "all failed" is raised below
                errors += 1
                print(f"  jev item error ({item['news_id']}/{aid}): {type(e).__name__}: {e}")

    if dry_run:
        for r in rows:
            sig = r["signal"]
            av, ro, du = sig.get("availability") or {}, sig.get("role") or {}, sig.get("durability") or {}
            print(
                f"  [{r['alert_tier']:>6}] {r['espn_id']:>8} urg={sig['urgency']:.2f} "
                f"avail={av.get('label', '-')}/{av.get('tier', '-')} role={ro.get('verdict', '-')} "
                f"durable={du.get('verdict', '-')} usable={sig['usable']}" + (f" drop={sig['drop_reason']}" if sig.get("drop_reason") else "")
            )
    elif rows:
        upsert(c, "jev_judgments", rows, "news_id,espn_id,question_set,model")

    cost = estimated_cost_usd(rows)
    print(
        f"  jev: {len(rows)} judged ({'dry run, nothing written' if dry_run else 'written'}), "
        f"{sum(skips.values())} skipped {dict(skips)}, {errors} errors, ~${cost:.4f} input cost"
    )
    if errors and not rows:
        raise RuntimeError(f"every Jev call failed ({errors} errors); see the item errors above")


if __name__ == "__main__":
    args = sys.argv[1:]
    lim = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    run(limit=lim, dry_run="--dry-run" in args)

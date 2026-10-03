"""nflverse -> Supabase. The analytical backbone (free, refreshed ~nightly in season)."""
import nflreadpy as nfl

from config import SEASON, df_to_rows, supabase_client, upsert


def _safe(label, fn):
    try:
        n = fn()
        print(f"  {label}: {n} rows")
    except Exception as e:  # one dataset failing shouldn't sink the whole run
        print(f"  {label}: FAILED ({type(e).__name__}: {e})")


def _id(v):
    """pandas turns int ids into floats (13269 -> 13269.0); normalize back to '13269'."""
    return str(int(float(v))) if v not in (None, "") else None


def players(c):
    df = nfl.load_ff_playerids().to_pandas()
    rows = []
    for r in df_to_rows(df, {"player_id": "gsis_id"}):
        d = r["data"]
        rows.append(
            {
                "player_id": r["player_id"],
                "full_name": d.get("name"),
                "position": d.get("position"),
                "team": d.get("team"),
                "sleeper_id": _id(d.get("sleeper_id")),
                "espn_id": _id(d.get("espn_id")),
                "data": d,
            }
        )
    return upsert(c, "players", rows, "player_id")


def weekly_stats(c, season):
    df = nfl.load_player_stats(seasons=season).to_pandas()
    rows = df_to_rows(df, {"season": "season", "week": "week", "player_id": "player_id"})
    return upsert(c, "weekly_stats", rows, "season,week,player_id")


def injuries(c, season):
    df = nfl.load_injuries(seasons=season).to_pandas()
    rows = df_to_rows(df, {"season": "season", "week": "week", "player_id": "gsis_id"})
    return upsert(c, "injuries", rows, "season,week,player_id")


def snap_counts(c, season):
    # Snap counts are keyed by PFR id, not GSIS. Join to players via data->>'pfr_id'.
    df = nfl.load_snap_counts(seasons=season).to_pandas()
    rows = df_to_rows(df, {"season": "season", "week": "week", "player_id": "pfr_player_id"})
    return upsert(c, "snap_counts", rows, "season,week,player_id")


def schedules(c, season):
    df = nfl.load_schedules(seasons=season).to_pandas()
    rows = df_to_rows(df, {"game_id": "game_id", "season": "season", "week": "week"})
    return upsert(c, "schedules", rows, "game_id")


def run(only_injuries=False):
    c = supabase_client()
    print(f"nflverse ingest, season {SEASON}")
    _safe("injuries", lambda: injuries(c, SEASON))
    if only_injuries:
        return
    _safe("players", lambda: players(c))
    _safe("schedules", lambda: schedules(c, SEASON))
    _safe("weekly_stats", lambda: weekly_stats(c, SEASON))
    _safe("snap_counts", lambda: snap_counts(c, SEASON))


if __name__ == "__main__":
    run()

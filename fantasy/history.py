"""League history: log every transaction and projection, and backfill past weeks.

  python -m fantasy.history pull       # season's transactions + ESPN weekly projections for past weeks
  python -m fantasy.history backfill   # replay the app's projection formula as of each past week, fit, log

Point-in-time rule: a replay for week w only uses what was knowable before week w kicked off:
ESPN's week-w projection, nflverse stats from weeks < w, Jev judgments made before then.
The one input ESPN does not keep history for is its season projection; `season_mix` controls
the substitute and is fitted against real app snapshots (see fit()).
"""
import json
import os
import statistics
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

from fantasy import engine as E
from fantasy import espn_league as L
from fantasy.env import CACHE, load_env
from fantasy.project import PRIOR_GAMES, blend_rate, defense_factor_clip, week_prior

HIST = CACHE / "espn" / "history"


def _cookie_base():
    load_env()
    base = L.BASE.format(season=L.SEASON, league=os.environ["ESPN_LEAGUE_ID"])
    return base, f"espn_s2={os.environ['ESPN_S2']}; SWID={os.environ['ESPN_SWID']}"


# ---------------------------------------------------------------- pulls
def pull_transactions(current: int | None = None) -> list:
    base, cookie = _cookie_base()
    current = current or L.current_period(cookie, base)
    seen = {}
    for sp in range(1, current + 1):
        for t in L._get(f"{base}?view=mTransactions2&scoringPeriodId={sp}", cookie, None).get("transactions", []):
            seen[t["id"]] = t
    HIST.mkdir(parents=True, exist_ok=True)
    rows = sorted(seen.values(), key=lambda t: t.get("proposedDate") or 0)
    (HIST / f"transactions_{L.SEASON}.json").write_text(json.dumps(rows))
    return rows


def pull_week_projections(weeks: list[int]) -> dict:
    """ESPN's pre-game projection (statSource 1) and actual (statSource 0) for each week, top ~1000 players."""
    base, cookie = _cookie_base()
    filt = {"players": {"limit": 1000, "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
                        "filterSlotIds": {"value": [0, 2, 4, 6]},
                        "filterStatsForSourceIds": {"value": [0, 1]}, "filterStatsForSplitTypeIds": {"value": [1]},
                        "filterStatsForScoringPeriodIds": {"value": weeks}}}
    d = L._get(f"{base}?view=kona_player_info&scoringPeriodId={max(weeks)}", cookie, filt)
    out = {}
    for e in d.get("players", []):
        p = e["player"]
        rec = {"name": p["fullName"], "pos": E.POS.get(p.get("defaultPositionId")), "proj": {}, "actual": {}}
        for s in p.get("stats", []):
            if s.get("seasonId") != L.SEASON or s.get("statSplitTypeId") != 1:
                continue
            key = "proj" if s.get("statSourceId") == 1 else "actual"
            rec[key][str(s["scoringPeriodId"])] = round(s.get("appliedTotal", 0.0), 2)
        out[str(p["id"])] = rec
    HIST.mkdir(parents=True, exist_ok=True)
    (HIST / f"espn_weeks_{L.SEASON}.json").write_text(json.dumps(out))
    return out


# ---------------------------------------------------------------- supabase logging
def _post(table: str, rows: list, conflict: str) -> None:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(f"{url}/rest/v1/{table}?on_conflict={conflict}", data=json.dumps(rows[i:i + 500]).encode(),
                                     method="POST", headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                                             "Content-Profile": "public", "Prefer": "resolution=merge-duplicates,return=minimal"})
        urllib.request.urlopen(req, timeout=90).read()


def _ts(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat() if ms else None


def log_transactions(rows: list) -> int:
    now = datetime.now(timezone.utc).isoformat()
    out = [{"id": t["id"], "season": L.SEASON, "scoring_period": t.get("scoringPeriodId"), "type": t.get("type"),
            "status": t.get("status"), "team_id": t.get("teamId"), "proposed_at": _ts(t.get("proposedDate")),
            "processed_at": _ts(t.get("processDate")), "bid": t.get("bidAmount"), "related_id": t.get("relatedTransactionId"),
            "items": t.get("items", []), "raw": t, "last_seen": now} for t in rows]
    _post("league_transactions", out, "id")
    return len(out)


def log_projections(data: dict) -> int:
    """The app's live projection for the current week, one row per player per build.

    `proj` stays the pregame projection after the game is played, so a locked
    player is logged too. His actual is not this column.
    """
    wk = str(data["meta"]["week"])
    rows = [{"season": data["meta"]["season"], "week": int(wk), "espn_id": p["id"], "method": "app_live",
             "as_of": data["meta"]["generatedAt"], "name": p["name"], "pos": p["pos"], "nfl_team": p["nfl"],
             "fantasy_team_id": p["teamId"] or None, "app_proj": p["proj"].get(wk), "espn_week_proj": p.get("espnWeek"),
             "rate": p.get("rate"), "sd": p.get("sd"), "parts": p.get("rateParts")}
            for p in data["players"]]
    _post("player_week_projections", rows, "season,week,espn_id,method,as_of")
    return len(rows)


# ---------------------------------------------------------------- replay
def _kickoff(week: int) -> datetime:
    """Thursday of the given NFL week (2026 season opened Thu Sep 10), 6 PM CT = 23:00 UTC."""
    return datetime(2026, 9, 10, 23, tzinfo=timezone.utc) + timedelta(weeks=week - 1)


def replay(week: int, season_mix: float, ctx: dict) -> dict:
    """App projection for `week` as it would have been computed just before that week's games.

    season_mix: weight on ESPN's *current* season projection (hindsight) versus the average of ESPN's
    weekly projections up to `week` (point-in-time) when standing in for the season projection.
    """
    weekly = [r for r in ctx["weekly"] if int(r["week"]) < week]
    snaps = [s for s in ctx["snaps"] if int(s["week"]) < week]
    dfac = E.defense_factors(weekly) if weekly else {}
    use = E.usage(weekly, snaps, ctx["plist"])
    cut = _kickoff(week)
    stamp = cut.strftime("%Y-%m-%dT%H:%M:%S")
    jev_rows = [j for j in ctx["jev"] if (j.get("judged_at") or "9")[:19].replace(" ", "T") < stamp]
    jev = E.jev_latest(jev_rows, ctx["news"], cut)
    out = {}
    for entry in ctx["allp"]:
        p = entry["player"]
        pos = E.POS.get(p.get("defaultPositionId"))
        eid = str(p["id"])
        hist = ctx["weeks"].get(eid)
        if not pos or not hist:
            continue
        team = E.PRO.get(p.get("proTeamId"), "FA")
        played = [v for w, v in hist["actual"].items() if int(w) < week]
        gp, ppg = len(played), (statistics.mean(played) if played else 0.0)
        espn_week = hist["proj"].get(str(week))
        past_proj = [v for w, v in hist["proj"].items() if int(w) <= week and v > 0.3]
        pit_rate = statistics.mean(past_proj) if past_proj else 0.0
        cur_rate = (E._stat(p, 1, 0, 0) or 0.0) / 17
        season_rate = season_mix * cur_rate + (1 - season_mix) * pit_rate
        on_field = espn_week is not None and espn_week > 0.3
        anchor = week_prior(espn_week, season_rate, on_field)
        gsis = ctx["espn_to_gsis"].get(eid)
        tm, jm = E.trend_mult(pos, use.get(gsis) if gsis else None), E.jev_mult(jev.get(eid))
        rate = blend_rate(pos, gp, ppg, anchor) * tm * jm
        bye = ctx["byes"].get(team)
        raw_opp = dfac.get(ctx["opp"].get((team, week), ""), {}).get(pos, 1.0) if (team, week) in ctx["opp"] else 1.0
        # ESPN's weekly projection already prices this opponent. Replay is always "this week".
        opp_used = 1.0 if on_field else defense_factor_clip(raw_opp)
        if week == bye or (team, week) not in ctx["opp"] or not on_field:
            proj = 0.0  # bye, or ESPN projected him out (ESPN zeroes players ruled out)
            opp_used = 1.0
        else:
            proj = rate * opp_used
        sd = E.CV[pos] * rate if gp < 3 else 0.5 * E.CV[pos] * rate + 0.5 * statistics.pstdev(played)
        out[eid] = {"proj": round(proj, 2), "espn": espn_week, "rate": round(rate, 2), "sd": round(sd, 2), "name": p["fullName"],
                    "pos": pos, "team": team, "actual": hist["actual"].get(str(week)),
                    "parts": {"espn_rate": round(anchor, 2), "ppg": round(ppg, 2), "gp": gp, "trend": round(tm, 3), "jev": jm,
                              "season_mix": season_mix, "opp": round(opp_used, 3), "k": PRIOR_GAMES.get(pos, E.K_PRIOR)}}
    return out


def context() -> dict:
    esp, db = CACHE / "espn", CACHE / "db"
    plist = E._load(db / "players.json")
    opp, byes = E.nfl_schedule(E._load(db / "schedule.json"))
    return {"allp": E._load(esp / "allplayers.json")["players"], "weekly": E._load(db / "weekly.json"), "snaps": E._load(db / "snaps.json"),
            "plist": plist, "jev": E._load(db / "jev.json"), "news": E._load(db / "news.json"), "opp": opp, "byes": byes,
            "espn_to_gsis": {p["espn_id"]: p["player_id"] for p in plist if p.get("espn_id")},
            "weeks": json.loads((HIST / f"espn_weeks_{L.SEASON}.json").read_text())}


def _snapshot(generated_at: str) -> dict:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(f"{url}/rest/v1/fantasy_snapshots?generated_at=eq.{generated_at}&select=week,data",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "public"})
    row = json.loads(urllib.request.urlopen(req, timeout=120).read())[0]
    wk = str(row["week"])
    return {p["id"]: p["proj"].get(wk) for p in row["data"]["players"] if not p.get("locked")}


def _rank_corr(a: list, b: list) -> float:
    def ranks(xs):
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        r = [0.0] * len(xs)
        for k, i in enumerate(order):
            r[i] = k
        return r
    ra, rb = ranks(a), ranks(b)
    ma, mb = statistics.mean(ra), statistics.mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else 0.0


REFERENCES = {5: "2026-10-11T11:01:44Z", 6: "2026-10-13T19:45:32Z"}


def fit(ctx: dict) -> dict:
    """Pick season_mix so replays reproduce what the app actually showed (weeks with a real pre-game snapshot)."""
    refs = {w: _snapshot(ts) for w, ts in REFERENCES.items()}
    res = {}
    for mix in (0.0, 0.25, 0.5, 0.75, 1.0):
        errs, cors = [], []
        for w, real in refs.items():
            rep = replay(w, mix, ctx)
            ids = [i for i in rep if i in real and real[i] and (real[i] > 1 or rep[i]["proj"] > 1)]
            a = [rep[i]["proj"] for i in ids]
            b = [real[i] for i in ids]
            errs.append(statistics.mean(abs(x - y) for x, y in zip(a, b)))
            cors.append(_rank_corr(a, b))
        res[mix] = {"mae_vs_app": round(statistics.mean(errs), 3), "rank_corr_vs_app": round(statistics.mean(cors), 4), "n": len(ids)}
    return res


def accuracy(ctx: dict, mix: float, weeks: list[int]) -> dict:
    """How the replayed app projection and ESPN's own projection did against what players scored."""
    out = {}
    for w in weeks:
        rep = replay(w, mix, ctx)
        rows = [r for r in rep.values() if r["actual"] is not None and r["espn"] and r["espn"] > 3 and r["proj"] > 0]
        out[w] = {"n": len(rows),
                  "app_mae": round(statistics.mean(abs(r["proj"] - r["actual"]) for r in rows), 2),
                  "espn_mae": round(statistics.mean(abs(r["espn"] - r["actual"]) for r in rows), 2),
                  "app_rank": round(_rank_corr([r["proj"] for r in rows], [r["actual"] for r in rows]), 3),
                  "espn_rank": round(_rank_corr([r["espn"] for r in rows], [r["actual"] for r in rows]), 3)}
    return out


def backfill(mix: float, ctx: dict, weeks: list[int], method: str = "app_replay") -> int:
    rows = []
    for w in weeks:
        for eid, r in replay(w, mix, ctx).items():
            if not r["proj"] and not r["espn"]:
                continue
            rows.append({"season": L.SEASON, "week": w, "espn_id": eid, "method": method, "as_of": _kickoff(w).isoformat(),
                         "name": r["name"], "pos": r["pos"], "nfl_team": r["team"], "app_proj": r["proj"], "espn_week_proj": r["espn"],
                         "rate": r["rate"], "sd": r["sd"], "actual": r["actual"], "parts": r["parts"]})
    _post("player_week_projections", rows, "season,week,espn_id,method,as_of")
    return len(rows)


if __name__ == "__main__":
    load_env()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pull"
    if cmd == "pull":
        tx = pull_transactions()
        print("transactions", len(tx), "logged", log_transactions(tx))
        wk = pull_week_projections(list(range(1, 7)))
        print("espn weekly projections for", len(wk), "players")
    elif cmd == "fit":
        ctx = context()
        print(json.dumps(fit(ctx), indent=1))
    elif cmd == "backfill":
        mix = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
        ctx = context()
        method = sys.argv[3] if len(sys.argv) > 3 else "app_replay"
        print(json.dumps(accuracy(ctx, mix, [2, 3, 4, 5]), indent=1))
        print("logged", backfill(mix, ctx, [1, 2, 3, 4, 5], method))

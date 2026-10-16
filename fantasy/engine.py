"""Turn the cached ESPN league + Supabase pulls into per-player weekly projections.

Output: web/public/data/fantasy.json, read by the web app's decision engine (web/src/engine).

Projection model (half-PPR points per game when active), deliberately simple and inspectable:
  espn_rate  = 0.6 * ESPN this-week projection + 0.4 * ESPN season projection / 17
  rate       = (games * season_ppg + K * espn_rate) / (games + K)      K = 6 games of prior
  rate      *= usage-trend multiplier (last 2 games vs earlier, capped at +/-6%)
  rate      *= Jev role multiplier (role expands / shrinks in recent news, +/-4%)
  week proj  = rate * opponent factor (points allowed to the position, shrunk) * availability
Run: python -m fantasy.engine
"""
from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fantasy.env import CACHE, ROOT

SEASON = 2026
REG_WEEKS = 14
LAST_WEEK = 17
K_PRIOR = 6.0
POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE"}
SLOTS = {0: "QB", 2: "RB", 4: "WR", 6: "TE", 23: "FLEX", 20: "BE", 21: "IR"}
CV = {"QB": 0.38, "RB": 0.50, "WR": 0.55, "TE": 0.60}
# ESPN proTeamId -> nflverse team code
PRO = {1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
       11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
       21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX",
       33: "BAL", 34: "HOU", 0: "FA"}
JEV_DAYS = 10
HEADSHOT = "https://a.espncdn.com/i/headshots/nfl/players/full/{}.png"


def _load(path: Path):
    return json.loads(path.read_text())


def _num(v, default=0.0):
    try:
        return float(v) if v not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _stat(player: dict, source: int, split: int, period: int, season: int = SEASON):
    for s in player.get("stats", []):
        if (s.get("statSourceId"), s.get("statSplitTypeId"), s.get("scoringPeriodId"), s.get("seasonId")) == (source, split, period, season):
            return s.get("appliedTotal")
    return None


# ---------------------------------------------------------------- schedule and defense
def nfl_schedule(rows: list) -> tuple[dict, dict]:
    """(team, week) -> opponent code, and team -> bye week."""
    opp, weeks = {}, defaultdict(set)
    for g in rows:
        w = int(g["week"])
        opp[(g["home"], w)] = g["away"]
        opp[(g["away"], w)] = g["home"]
        weeks[g["home"]].add(w)
        weeks[g["away"]].add(w)
    byes = {t: next((w for w in range(1, 19) if w not in ws), None) for t, ws in weeks.items()}
    return opp, byes


def defense_factors(weekly: list) -> dict:
    """Half-PPR points each defense allows to each position, relative to league average, shrunk toward 1."""
    allowed = defaultdict(float)
    games = defaultdict(set)
    for r in weekly:
        pos, opp = r.get("pos"), r.get("opp")
        if pos not in CV or not opp:
            continue
        pts = _num(r["ppr"]) - 0.5 * _num(r["rec"])
        allowed[(opp, pos)] += pts
        games[opp].add(r["week"])
    out = {}
    for pos in CV:
        per_game = {t: allowed[(t, pos)] / len(games[t]) for t in games if games[t]}
        avg = statistics.mean(per_game.values())
        for t, v in per_game.items():
            g = len(games[t])
            raw = v / avg if avg else 1.0
            f = 1 + (raw - 1) * g / (g + 8)
            out.setdefault(t, {})[pos] = round(min(1.15, max(0.85, f)), 3)
    return out


# ---------------------------------------------------------------- usage trends
def usage(weekly: list, snaps: list, players: list) -> dict:
    """gsis id -> usage summary with last-2-games vs earlier trend."""
    by = defaultdict(list)
    for r in weekly:
        by[r["player_id"]].append(r)
    pfr_to_gsis = {p["pfr_id"]: p["player_id"] for p in players if p.get("pfr_id")}
    snap_by = defaultdict(dict)
    for s in snaps:
        g = pfr_to_gsis.get(s["pfr_id"])
        if g:
            snap_by[g][s["week"]] = _num(s["off_pct"])
    out = {}
    for gid, rows in by.items():
        rows.sort(key=lambda r: r["week"])
        ts = [_num(r["ts"]) for r in rows]
        opp = [_num(r["tgt"]) + _num(r["car"]) for r in rows]
        sp = [snap_by[gid].get(r["week"]) for r in rows if snap_by[gid].get(r["week"]) is not None]
        def split(xs):
            if len(xs) < 3:
                return None
            return statistics.mean(xs[-2:]) - statistics.mean(xs[:-2])
        out[gid] = {
            "games": len(rows),
            "tgtShare": round(statistics.mean(ts), 3) if ts else None,
            "tgtShareTrend": round(split(ts), 3) if split(ts) is not None else None,
            "oppPg": round(statistics.mean(opp), 1) if opp else None,
            "oppTrend": round(split(opp), 1) if split(opp) is not None else None,
            "snapPct": round(statistics.mean(sp), 3) if sp else None,
            "snapTrend": round(split(sp), 3) if split(sp) is not None else None,
            "tgtPg": round(statistics.mean(_num(r["tgt"]) for r in rows), 1),
            "carPg": round(statistics.mean(_num(r["car"]) for r in rows), 1),
            "recYdsPg": round(statistics.mean(_num(r["recy"]) for r in rows), 1),
            "rushYdsPg": round(statistics.mean(_num(r["ry"]) for r in rows), 1),
            "passYdsPg": round(statistics.mean(_num(r["py"]) for r in rows), 1),
            "tdTotal": int(sum(_num(r["ptd"]) + _num(r["rtd"]) + _num(r["rectd"]) for r in rows)),
            "headshot": rows[-1].get("headshot"),
        }
    return out


def trend_mult(pos: str, u: dict | None) -> float:
    if not u:
        return 1.0
    if pos in ("WR", "TE") and u.get("tgtShareTrend") is not None:
        return 1 + max(-0.06, min(0.06, u["tgtShareTrend"] * 0.8))
    if pos == "RB" and u.get("oppTrend") is not None and u.get("oppPg"):
        return 1 + max(-0.06, min(0.06, u["oppTrend"] / max(u["oppPg"], 1) * 0.25))
    return 1.0


# ---------------------------------------------------------------- Jev news signals
def jev_latest(jev: list, news: list, now: datetime) -> dict:
    heads = {n["news_id"]: n for n in news}
    out = {}
    for j in jev:  # newest first
        eid = j.get("espn_id")
        if not eid or eid in out:
            continue
        # Python 3.10's fromisoformat rejects 4-digit fractions ("…:38.3518+00:00"); drop the fraction.
        when = datetime.fromisoformat(re.sub(r"\.\d+", "", j["judged_at"].replace("Z", "+00:00")))
        if now - when > timedelta(days=JEV_DAYS):
            continue
        sig = j.get("signal") or {}
        if not sig.get("usable", True):
            continue
        n = heads.get(j["news_id"], {})
        role = (sig.get("role") or {}).get("verdict", "none")
        out[eid] = {
            "headline": n.get("headline"),
            "url": n.get("url"),
            "published": n.get("published_at"),
            "role": role,
            "firm": sig.get("firm_p"),
            "availability": (sig.get("availability") or {}).get("label"),
            "timeline": (sig.get("durability") or {}).get("timeline"),
            "urgency": sig.get("urgency"),
            "tier": j.get("alert_tier"),
        }
    return out


def jev_mult(j: dict | None) -> float:
    if not j or (j.get("firm") or 0) < 0.6:
        return 1.0
    return {"expands": 1.04, "shrinks": 0.96}.get(j.get("role"), 1.0)


# ---------------------------------------------------------------- availability
# Measured on 2025 + 2026 weeks 3-5 (287 questionable, 20 doubtful, 311 out player-weeks, usage baseline >= 1.5 pts):
#   Out: 0% played. Doubtful: 0% played. Questionable: 63% played; those who played scored ~88% of their usual.
#   By practice report, questionable players played 74% (full), 63% (limited), 50% (did not practice).
Q_PLAY_BY_PRACTICE = {"Full": 0.75, "Limi": 0.63, "Did ": 0.50}  # keyed by first 4 chars of practice_status
Q_PLAY_DEFAULT = 0.63
Q_IF_PLAYS = 0.88   # points when a questionable/doubtful player does play, vs his usual
DOUBTFUL_PLAY = 0.03
# Backups when the starter misses (2025 nflverse, backups vs weeks their starter played, 80% ranges):
#   RB next men x1.6 (1.1-2.1), WR next men x1.6 / x2.0 (1.1-2.7), TE ~x1.1 (0.7-1.7, no reliable lift),
#   starter questionable but played: no lift. Shrunk toward 1 because the backup's own average already
#   contains some of his recent starter-less games.
BACKUP_LIFT = {"RB": 1.4, "WR": 1.4}   # TE and QB: none
BACKUP_DEPTH = 2                        # applies to the two highest-rate teammates behind the starter


def availability(status: str | None, pos: str, week: int, current: int, jev: dict | None,
                 practice: str | None = None) -> tuple[float, float, str | None]:
    """(chance he plays in `week`, scoring multiplier if he plays, note on the assumption used)."""
    healthy = 0.96 if pos == "RB" else 0.97
    timeline = (jev or {}).get("timeline")
    out_weeks = {"one_week": 1, "two_to_three_weeks": 3, "four_plus_weeks": 5, "season_ending": 99}.get(timeline)
    ahead = week - current
    if status in (None, "ACTIVE", "NORMAL"):
        return healthy, 1.0, None
    if status in ("QUESTIONABLE", "DAY_TO_DAY"):
        if ahead != 0:
            return healthy, 1.0, "Listed questionable"
        pl = Q_PLAY_BY_PRACTICE.get((practice or "")[:4], Q_PLAY_DEFAULT)
        return pl, Q_IF_PLAYS, f"Listed questionable: {round(pl * 100)}% to play, ~{round(Q_IF_PLAYS * 100)}% of usual if he does"
    if status == "DOUBTFUL":
        if ahead == 0:
            return DOUBTFUL_PLAY, Q_IF_PLAYS, "Listed doubtful: almost never plays"
        return (0.80 if ahead == 1 else healthy), 1.0, "Listed doubtful"
    if status in ("OUT", "SUSPENSION"):
        n = out_weeks or (2 if status == "SUSPENSION" else 1)
        note = f"Out; assumed back Week {current + n}" + (" (news timeline)" if out_weeks else " (assumption)")
        if n >= 99:
            return 0.0, 1.0, "Out for the season (news timeline)"
        return (0.0 if ahead < n else (0.85 if ahead == n else healthy)), 1.0, note
    if status == "INJURY_RESERVE":
        n = out_weeks or 4
        if n >= 99:
            return 0.0, 1.0, "Out for the season (news timeline)"
        note = f"On IR; assumed back Week {current + n}" + (" (news timeline)" if out_weeks else " (assumption)")
        return (0.0 if ahead < n else (0.80 if ahead == n else 0.94)), 1.0, note
    return healthy, 1.0, None


# ---------------------------------------------------------------- main build
def build() -> dict:
    esp, db = CACHE / "espn", CACHE / "db"
    league, matchups = _load(esp / "league.json"), _load(esp / "matchups.json")
    allp = _load(esp / "allplayers.json")["players"]
    fa_ids = {p["id"]: p["status"] for p in _load(esp / "fa.json")["players"]}
    weekly, snaps, plist = _load(db / "weekly.json"), _load(db / "snaps.json"), _load(db / "players.json")
    sched, trending = _load(db / "schedule.json"), _load(db / "trending.json")
    jev_rows, news = _load(db / "jev.json"), _load(db / "news.json")
    inj_rows = _load(db / "injuries.json") if (db / "injuries.json").exists() else []

    now = datetime.now(timezone.utc)
    current = int(league.get("scoringPeriodId") or 1)
    opp, byes = nfl_schedule(sched)
    dfac = defense_factors(weekly)
    use = usage(weekly, snaps, plist)
    espn_to_gsis = {p["espn_id"]: p["player_id"] for p in plist if p.get("espn_id")}
    practice = {(r["gsis"], r["week"]): r.get("ps") for r in inj_rows if r.get("gsis")}
    espn_to_sleeper = {p["espn_id"]: p["sleeper_id"] for p in plist if p.get("espn_id") and p.get("sleeper_id")}
    jev = jev_latest(jev_rows, news, now)

    latest_pull = max(r["pulled_at"] for r in trending) if trending else None
    adds = {r["sleeper_id"]: r["count"] for r in trending if r["pulled_at"] == latest_pull and r["kind"] == "add"}
    drops = {r["sleeper_id"]: r["count"] for r in trending if r["pulled_at"] == latest_pull and r["kind"] == "drop"}

    roster_slot = {}
    for t in league["teams"]:
        for e in t["roster"]["entries"]:
            roster_slot[e["playerId"]] = SLOTS.get(e["lineupSlotId"], str(e["lineupSlotId"]))

    players = []
    for entry in allp:
        p = entry["player"]
        pos = POS.get(p.get("defaultPositionId"))
        if not pos:
            continue
        eid = str(p["id"])
        team = PRO.get(p.get("proTeamId"), "FA")
        gsis = espn_to_gsis.get(eid)
        u = use.get(gsis) if gsis else None
        j = jev.get(eid)
        status = p.get("injuryStatus")

        actual = {}
        for wk in range(1, current + 1):
            v = _stat(p, 0, 1, wk)
            if v is not None:
                actual[wk] = round(v, 1)
        played = [v for wk, v in actual.items() if wk < current]
        gp = len(played)
        ppg = statistics.mean(played) if played else 0.0
        espn_week = _stat(p, 1, 1, current)
        espn_season = _stat(p, 1, 0, 0) or 0.0
        season_rate = espn_season / 17
        if espn_week and espn_week > 0.3 and status in (None, "ACTIVE", "QUESTIONABLE", "DAY_TO_DAY"):
            espn_rate = 0.6 * espn_week + 0.4 * season_rate
        else:
            espn_rate = season_rate
        base = (gp * ppg + K_PRIOR * espn_rate) / (gp + K_PRIOR) if (gp or espn_rate) else 0.0
        tm, jm = trend_mult(pos, u), jev_mult(j)
        rate = base * tm * jm

        bye = byes.get(team)
        proj, proj_if, notes, play_p = {}, {}, None, None
        for wk in range(current, LAST_WEEK + 1):
            if wk == current and wk in actual:
                proj[wk] = proj_if[wk] = actual[wk]  # game already played this week
                continue
            if team == "FA" or wk == bye or (team, wk) not in opp:
                proj[wk] = proj_if[wk] = 0.0
                continue
            av, cond, note = availability(status, pos, wk, current, j, practice.get((gsis, current)) if gsis else None)
            notes = notes or note
            if wk == current:
                play_p = round(av, 2)
            f = dfac.get(opp[(team, wk)], {}).get(pos, 1.0)
            proj[wk] = round(rate * f * av * cond, 2)          # expected points: chance he plays x points if he plays
            proj_if[wk] = round(rate * f * cond, 2) if av > 0 else 0.0   # points if he plays

        recent = [v for wk, v in sorted(actual.items()) if wk <= current][-3:]  # last 3 games with a stat line
        last3 = round(statistics.mean(recent), 1) if recent else None
        emp_sd = statistics.pstdev(played) if gp >= 3 else None
        sd = CV[pos] * rate if emp_sd is None else 0.5 * CV[pos] * rate + 0.5 * emp_sd
        own = p.get("ownership") or {}
        sid = espn_to_sleeper.get(eid)
        on_team = entry.get("onTeamId") or 0
        players.append({
            "id": eid, "name": p["fullName"], "pos": pos, "nfl": team, "teamId": on_team,
            "status": "ONTEAM" if on_team else fa_ids.get(p["id"], "FREEAGENT"),
            "slot": roster_slot.get(p["id"]), "inj": status, "injNote": notes, "bye": bye,
            "photo": HEADSHOT.format(eid),
            "actual": actual, "gp": gp, "ppg": round(ppg, 2),
            "espnWeek": round(espn_week, 1) if espn_week is not None else None,
            "espnSeason": round(espn_season, 1),
            "own": round(own.get("percentOwned") or 0, 1), "ownChg": round(own.get("percentChange") or 0, 2),
            "started": round(own.get("percentStarted") or 0, 1),
            "usage": u, "adds": adds.get(sid, 0), "drops": drops.get(sid, 0), "jev": j,
            "rate": round(rate, 2),
            "rateParts": {"espn": round(espn_rate, 2), "season": round(ppg, 2), "trend": round(tm, 3), "jev": jev_mult(j)},
            "proj": {str(k): v for k, v in proj.items()}, "projIf": {str(k): v for k, v in proj_if.items()},
            "playP": play_p, "last3": last3, "sd": round(sd, 2),
            "ros": round(sum(v for wk, v in proj.items() if current < wk <= REG_WEEKS), 1),
            "playoffs": round(sum(v for wk, v in proj.items() if wk > REG_WEEKS), 1),
            "tradeLocked": bool(entry.get("tradeLocked")),
            "locked": current in actual,  # this week's game already played
            "headshotAlt": (u or {}).get("headshot"),
        })

    # Backup lift: when the team's top man at RB/WR is likely to miss, the next two score more.
    by_unit: dict = {}
    for q in players:
        if q["nfl"] != "FA" and q["pos"] in BACKUP_LIFT and q["rate"] >= 2.5:
            by_unit.setdefault((q["nfl"], q["pos"]), []).append(q)
    for (team, pos), grp in by_unit.items():
        grp.sort(key=lambda q: -q["rate"])
        if len(grp) < 2:
            continue
        starter = grp[0]
        for q in grp[1 : 1 + BACKUP_DEPTH]:
            q["lift"] = {}
            for wk in range(current, LAST_WEEK + 1):
                k = str(wk)
                s_if, s_ex = starter["projIf"].get(k, 0.0), starter["proj"].get(k, 0.0)
                if wk == current and starter["locked"]:
                    continue
                if starter["bye"] == wk:
                    continue  # bye: both idle
                # projIf is 0 when the starter is ruled out, so that means he misses for sure
                miss = 1.0 if s_if <= 0 else max(0.0, 1.0 - s_ex / s_if)   # chance the starter does not play
                m = 1.0 + (BACKUP_LIFT[pos] - 1.0) * miss
                if m > 1.005 and not (wk == current and q["locked"]):
                    q["proj"][k] = round(q["proj"][k] * m, 2)
                    q["projIf"][k] = round(q["projIf"][k] * m, 2)
                    q["lift"][k] = round(m, 3)
            if q["lift"]:
                q["ros"] = round(sum(v for wk, v in ((int(a), b) for a, b in q["proj"].items()) if current < wk <= REG_WEEKS), 1)
                q["playoffs"] = round(sum(v for wk, v in ((int(a), b) for a, b in q["proj"].items()) if wk > REG_WEEKS), 1)
                m0 = q["lift"].get(str(current))
                if m0:
                    note = f"{starter['name']} may miss: +{round((m0 - 1) * 100)}% opportunity"
                    q["injNote"] = f"{q['injNote']}. {note}" if q["injNote"] else note

    # Position ranks: ours (regular season rest + 1.5x playoff weeks) vs ESPN season projection.
    for pos in CV:
        group = [p for p in players if p["pos"] == pos]
        for i, p in enumerate(sorted(group, key=lambda p: -(p["ros"] + 1.5 * p["playoffs"]))):
            p["ourRank"] = i + 1
        for i, p in enumerate(sorted(group, key=lambda p: -p["espnSeason"])):
            p["espnRank"] = i + 1 if p["espnSeason"] > 0 else None  # no ESPN projection = no comparison

    teams = []
    for t in league["teams"]:
        rec = t["record"]["overall"]
        counter = t.get("transactionCounter") or {}
        teams.append({
            "id": t["id"], "name": t["name"].strip(), "abbrev": t.get("abbrev"), "logo": t.get("logo"),
            "wins": rec["wins"], "losses": rec["losses"], "ties": rec["ties"],
            "pf": round(rec["pointsFor"], 1), "pa": round(rec["pointsAgainst"], 1),
            "faabLeft": league["settings"]["acquisitionSettings"]["acquisitionBudget"] - counter.get("acquisitionBudgetSpent", 0),
            "waiverRank": t.get("waiverRank"),
            "espnPlayoffPct": (t.get("currentSimulationResults") or {}).get("playoffPct"),
            "trades": counter.get("trades", 0), "acquisitions": counter.get("acquisitions", 0),
        })

    games = []
    for m in matchups["schedule"]:
        home, away = m.get("home", {}), m.get("away", {})
        g = {"week": m["matchupPeriodId"], "home": home.get("teamId"), "away": away.get("teamId"),
             "winner": m.get("winner")}
        if m["matchupPeriodId"] < current:
            g["homePts"], g["awayPts"] = home.get("totalPoints"), away.get("totalPoints")
        games.append(g)

    s = league["settings"]
    out = {
        "meta": {
            "generatedAt": now.isoformat(timespec="seconds"), "season": SEASON, "week": current,
            "regularWeeks": s["scheduleSettings"]["matchupPeriodCount"], "lastWeek": LAST_WEEK,
            "playoffTeams": s["scheduleSettings"]["playoffTeamCount"], "leagueName": s["name"],
            "faabBudget": s["acquisitionSettings"]["acquisitionBudget"],
            "slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 2, "BE": 7, "IR": 2},
            "tradeDeadline": datetime.fromtimestamp(s["tradeSettings"]["deadlineDate"] / 1000, timezone.utc).date().isoformat(),
            "myTeamId": 4, "scoring": "Half PPR",
            "sources": ["ESPN league API (your cookies)", "nflverse weekly stats and snaps", "Sleeper trending adds",
                        "nflverse 2026 schedule", "Jev judgments on ESPN news"],
            "sleeperPulledAt": latest_pull,
        },
        "teams": teams, "games": games, "defense": dfac, "players": players,
        # NFL opponent by team and week (byes absent), for playoff-schedule strength in the app.
        "nflOpp": {t: {str(w): opp[(t, w)] for w in range(1, LAST_WEEK + 1) if (t, w) in opp} for t in byes},
    }
    return out


def main():
    data = build()
    dest = ROOT / "web" / "public" / "data" / "fantasy.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {dest} ({dest.stat().st_size:,} bytes, {len(data['players'])} players)")


if __name__ == "__main__":
    main()

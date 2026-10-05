"""Score the Jev question set against labeled items and sweep confidence cutoffs.

  python -m jev_signals.evals.run_eval                      # ask Jev (live) or the mock (JEV_MODE=mock)
  python -m jev_signals.evals.run_eval --from-run runs/X.json   # re-threshold stored answers: ZERO API calls
  python -m jev_signals.evals.run_eval --labels my_labels.jsonl

seed_labels.jsonl is SYNTHETIC (invented players, hand-written sentences) so the harness works on day one.
It is far too small and too clean to tune thresholds on. Build a real set: run `judge_news.py --dry-run`,
copy 100-200 real ESPN items into a jsonl with your own labels, and tune against that.

What to read from the output: for each cutoff, coverage (share of items the label would auto-apply to) and
accuracy within that slice. Pick the cutoff where accuracy meets the cost of being wrong (a false "out"
benches a starter; a missed "out" costs a zero), then put it in settings.Thresholds.
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from jev_signals import settings
from jev_signals.client import JevAnswers, JevClient
from jev_signals.questions import news_questions
from jev_signals.signals import interpret

HERE = Path(__file__).parent
CUTOFFS = (0.5, 0.7, 0.8, 0.9, 0.95)


def _state(r):
    return {"player": r["player"], "item": {"source_type": r.get("source_type", "news"), "text": r["text"]}}


def _pct(num, den):
    return f"{100 * num / den:5.1f}%" if den else "   n/a"


def report(rows, answers):
    print(f"\n{len(rows)} labeled items, model={next(iter(answers.values())).model}\n")
    sigs = {r["id"]: interpret(answers[r["id"]]) for r in rows}

    # gates
    ap = [(r, answers[r["id"]].nouls["about_player"]) for r in rows if "about_player" in r["labels"]]
    ok = sum((p >= settings.DEFAULT_THRESHOLDS.about_player_min) == r["labels"]["about_player"] for r, p in ap)
    inj = [(r, answers[r["id"]].nouls["injection_suspect"]) for r in rows if "injection" in r["labels"]]
    inj_ok = sum((p >= settings.DEFAULT_THRESHOLDS.injection_drop) == r["labels"]["injection"] for r, p in inj)
    print(f"about_player gate  accuracy {_pct(ok, len(ap))}  ({ok}/{len(ap)})")
    print(f"injection gate     accuracy {_pct(inj_ok, len(inj))}  ({inj_ok}/{len(inj)})")

    # availability: accuracy vs coverage by Choice confidence
    av = [(r, answers[r["id"]].choices["availability_status"]) for r in rows if "availability_status" in r["labels"] and sigs[r["id"]].usable]
    print("\navailability_status (usable items only): confidence cutoff -> coverage, accuracy in slice")
    for cut in CUTOFFS:
        sl = [(r, c) for r, c in av if c.confidence >= cut]
        right = sum(c.choice == r["labels"]["availability_status"] for r, c in sl)
        print(f"  conf >= {cut:.2f}   coverage {_pct(len(sl), len(av))}   accuracy {_pct(right, len(sl))}   ({right}/{len(sl)})")
    wrong = [(r["id"], c.choice, r["labels"]["availability_status"], round(c.confidence, 2)) for r, c in av if c.choice != r["labels"]["availability_status"]]
    if wrong:
        print("  misses (id, got, wanted, conf):", wrong)

    # role verdict ("possible" = abstained)
    rl = [(r, sigs[r["id"]].role["verdict"]) for r in rows if "role" in r["labels"] and sigs[r["id"]].usable]
    decided = [(r, v) for r, v in rl if v != "possible"]
    right = sum(v == r["labels"]["role"] for r, v in decided)
    print(f"\nrole verdict       decided {_pct(len(decided), len(rl))}   accuracy when decided {_pct(right, len(decided))}   ({right}/{len(decided)})")
    du = [(r, sigs[r["id"]].durability["verdict"]) for r in rows if "durability" in r["labels"] and sigs[r["id"]].usable]
    right = sum(v == r["labels"]["durability"] for r, v in du)
    print(f"durability verdict accuracy {_pct(right, len(du))}   ({right}/{len(du)})  [mixed/unclear count as misses]")


def main(argv):
    labels = Path(argv[argv.index("--labels") + 1]) if "--labels" in argv else HERE / "seed_labels.jsonl"
    rows = [json.loads(line) for line in labels.read_text().splitlines() if line.strip()]
    if "--from-run" in argv:
        dump = json.loads(Path(argv[argv.index("--from-run") + 1]).read_text())
        answers = {k: JevAnswers.from_dict(v) for k, v in dump["answers"].items()}
    else:
        if settings.mode() == "off":
            sys.exit("Jev is off: set TYPESAFE_API_KEY (live) or JEV_MODE=mock (heuristics, not Jev)")
        qs = news_questions()
        with JevClient() as client:
            answers = {r["id"]: client.ask(_state(r), qs) for r in rows}
        out = HERE / "runs"
        out.mkdir(exist_ok=True)
        path = out / f"{datetime.now():%Y%m%d-%H%M%S}-{next(iter(answers.values())).model}.json"
        path.write_text(json.dumps({"answers": {k: v.to_dict() for k, v in answers.items()}}))
        print(f"raw answers saved to {path} (re-threshold later with --from-run, no API calls)")
    if os.getenv("JEV_MODE") == "mock":
        print("NOTE: mock-heuristic answers. These numbers describe the keyword matcher, not Jev.")
    report(rows, answers)


if __name__ == "__main__":
    main(sys.argv[1:])

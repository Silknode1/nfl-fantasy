"""Entry point for the scheduled refresh.

  python run_nightly.py              # full refresh (nightly)
  python run_nightly.py --inactives  # Sunday-morning: injuries, ESPN, odds, Sleeper only
"""
import sys

import espn_ingest
import nflverse_ingest
import odds_ingest
import sleeper_ingest


def step(label, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except SystemExit:
        raise  # config problems should stop the run loudly
    except Exception as e:
        print(f"{label}: FAILED ({type(e).__name__}: {e})")


if __name__ == "__main__":
    inactives = "--inactives" in sys.argv
    step("nflverse", nflverse_ingest.run, only_injuries=inactives)
    step("espn", espn_ingest.run)
    step("sleeper", sleeper_ingest.run)
    step("odds", odds_ingest.run)
    print("done")

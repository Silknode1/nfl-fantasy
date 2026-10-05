"""Entry point for the scheduled refresh.

  python run_nightly.py              # full refresh (nightly)
  python run_nightly.py --inactives  # Sunday-morning: injuries, ESPN, odds, Sleeper, news + Jev only

The news and Jev steps import lazily: a missing typesafe-sdk or API key must not stop the data refresh.
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


def _news():
    import news_ingest

    news_ingest.run()


def _jev():
    import judge_news

    judge_news.run()  # skips itself politely when TYPESAFE_API_KEY is not set


if __name__ == "__main__":
    inactives = "--inactives" in sys.argv
    step("nflverse", nflverse_ingest.run, only_injuries=inactives)
    step("espn", espn_ingest.run)
    step("sleeper", sleeper_ingest.run)
    step("odds", odds_ingest.run)
    step("news", _news)
    step("jev", _jev)
    print("done")

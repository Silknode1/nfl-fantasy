import shutil
from pathlib import Path

from jev_signals.evals import run_eval


def test_harness_runs_in_mock_mode_and_rethresholds_from_a_dump(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("JEV_MODE", "mock")
    seed = Path(run_eval.__file__).parent / "seed_labels.jsonl"
    shutil.copy(seed, tmp_path / "seed_labels.jsonl")
    monkeypatch.setattr(run_eval, "HERE", tmp_path)  # keep the run dump out of the repo

    run_eval.main([])
    out = capsys.readouterr().out
    assert "mock-heuristic answers" in out and "about_player gate" in out and "conf >= 0.90" in out
    dumps = list((tmp_path / "runs").glob("*.json"))
    assert len(dumps) == 1

    run_eval.main(["--from-run", str(dumps[0])])  # zero API calls, same report
    assert "15 labeled items" in capsys.readouterr().out

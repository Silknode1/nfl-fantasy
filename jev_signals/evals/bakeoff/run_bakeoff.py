"""Live bake-off: two question-set designs (one per TypeSafe skill) on the same items, scored against hand labels.

  python jev_signals/evals/bakeoff/run_bakeoff.py     # 16 items x 2 variants = 32 real calls, sequential (about 61K input tokens, ~$0.003)

The labels are the author's hand labels, not ground truth, and n=16 is illustrative, not a benchmark.
Both variants get identical state. The key is read from TYPESAFE_API_KEY (the project .env via python-dotenv)
and is never printed. Raw answers are saved to results.json so the policy code can be re-run offline.
"""
from __future__ import annotations

import importlib.util
import inspect
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]  # bakeoff -> evals -> jev_signals -> project root
MODEL = "jev-1.13.0"

# variant label -> (module stem, id of its kind Choice, id of its transaction Choice)
VARIANTS = {
    "A_building": ("variant_a_building", "kind", "transaction_type"),
    "B_router": ("variant_b_router", "item_kind", "transaction_type"),
}


def _load(stem: str):
    spec = importlib.util.spec_from_file_location(stem, HERE / f"{stem}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _to_dicts(resp) -> dict:
    """One converter for both variants, so neither gets a formatting advantage."""
    out: dict[str, dict] = {}
    for qid, a in resp.nouls.items():
        out[qid] = {"noul": float(a.noul)}
    for qid, a in resp.choices.items():
        out[qid] = {"choice": a.choice, "confidence": float(a.confidence),
                    "probabilities": {str(k): float(v) for k, v in a.probabilities.items()}}
    for qid, a in resp.scores.items():
        out[qid] = {"score": float(a.score), "confidence": float(a.confidence)}
    return out


def _describe(e: Exception) -> str:
    status = getattr(e, "status", None)
    try:
        rid = getattr(e, "request_id", None)
    except Exception:
        rid = None
    return f"{type(e).__name__} status={status} request_id={rid} body={str(getattr(e, 'body', '') or e)[:300]}"


def run() -> list[dict]:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass
    if not os.getenv("TYPESAFE_API_KEY"):
        sys.exit("TYPESAFE_API_KEY is not visible to this process (checked the environment and .env).")
    from typesafe_sdk import RetryPolicy, TypeSafeClient

    items = json.loads((HERE / "items.json").read_text())
    results: list[dict] = []
    with TypeSafeClient(model=MODEL, retry=RetryPolicy(max_retries=2)) as sdk:
        for vname, (stem, kind_key, txn_key) in VARIANTS.items():
            mod = _load(stem)
            questions = mod.build_questions()
            takes_state = "state" in inspect.signature(mod.interpret).parameters
            for it in items:
                row = {"variant": vname, "id": it["id"]}
                try:
                    t0 = time.perf_counter()
                    resp = sdk.system_one(it["state"], questions)
                    row["ms"] = round((time.perf_counter() - t0) * 1000)
                    answers = _to_dicts(resp)
                    verdict = mod.interpret(answers, it["state"]) if takes_state else mod.interpret(answers)
                    kc, tc = answers.get(kind_key, {}), answers.get(txn_key, {})
                    row.update(
                        model=str(resp.model),
                        input_tokens=int(resp.usage.input_tokens),
                        verdict=verdict,
                        raw_kind=kc.get("choice"), raw_kind_conf=kc.get("confidence"),
                        raw_txn=tc.get("choice"), raw_txn_conf=tc.get("confidence"),
                        nouls={k: v["noul"] for k, v in answers.items() if "noul" in v},
                        answers=answers,
                    )
                except Exception as e:  # keep going: one bad item must not lose the rest
                    row["error"] = _describe(e)
                results.append(row)
    (HERE / "results.json").write_text(json.dumps(results, indent=1))
    return results


def _ok(exp: dict, v: dict) -> bool:
    if v["usable"] != exp["usable"]:
        return False
    return (not exp["usable"]) or (v["kind"] == exp["kind"] and v["transaction_type"] == exp["transaction_type"])


def report(items: list[dict], results: list[dict]) -> None:
    by = {(r["variant"], r["id"]): r for r in results}
    print(f"\nmodel pinned: {MODEL}; models seen: {sorted({r.get('model') for r in results if r.get('model')})}")
    for it in items:
        e = it["expected"]
        tag = "SYNTH" if it["synthetic"] else "real "
        hard = " HARD" if it["hard"] else ""
        want = f"usable={e['usable']}" if not e["usable"] else f"{e['kind']}/{e['transaction_type']}"
        print(f"\n{it['id']:<24} [{tag}{hard}] want {want}")
        for vname in VARIANTS:
            r = by[(vname, it["id"])]
            if "error" in r:
                print(f"   {vname:<10} ERROR {r['error']}")
                continue
            v = r["verdict"]
            kc = "-" if v["kind_confidence"] is None else f"{v['kind_confidence']:.2f}"
            got = f"usable={v['usable']}" if not v["usable"] else f"{v['kind']}({kc})/{v['transaction_type']}"
            nz = " ".join(f"{k[:6]}={x:.2f}" for k, x in r["nouls"].items())
            print(f"   {vname:<10} {'OK  ' if _ok(e, v) else 'MISS'} {got:<48} raw={r['raw_kind']}/{r['raw_txn']}  [{nz}]  flags={v['flags']}")

    print("\n=== summary (hand labels, n small, illustrative) ===")
    for vname in VARIANTS:
        rs = [(it, by[(vname, it["id"])]) for it in items if "error" not in by[(vname, it["id"])]]
        n = len(rs)
        usable_ok = sum(r["verdict"]["usable"] == it["expected"]["usable"] for it, r in rs)
        keep = [(it, r) for it, r in rs if it["expected"]["usable"]]
        kind_ok = sum(r["verdict"]["kind"] == it["expected"]["kind"] for it, r in keep)
        txn_ok = sum(r["verdict"]["transaction_type"] == it["expected"]["transaction_type"] for it, r in keep)
        raw_kind_ok = sum(r["raw_kind"] == it["expected"]["kind"] for it, r in keep)
        all_ok = sum(_ok(it["expected"], r["verdict"]) for it, r in rs)
        easy = [(it, r) for it, r in rs if not it["hard"]]
        easy_ok = sum(_ok(it["expected"], r["verdict"]) for it, r in easy)
        abstain = sum(r["verdict"]["kind"] == "other" and it["expected"]["kind"] != "other" for it, r in keep)
        toks = [r["input_tokens"] for _, r in rs]
        ms = [r["ms"] for _, r in rs]
        print(f"{vname}: answered {n}/{len(items)} | fully correct {all_ok}/{n} (non-hard {easy_ok}/{len(easy)}) | "
              f"usable gate {usable_ok}/{n} | kind {kind_ok}/{len(keep)} (raw argmax {raw_kind_ok}/{len(keep)}, abstained {abstain}) | "
              f"txn type {txn_ok}/{len(keep)} | input tokens/request {sum(toks)/len(toks):.0f} | latency mean {sum(ms)/len(ms):.0f} ms, max {max(ms)} ms")


if __name__ == "__main__":
    items = json.loads((HERE / "items.json").read_text())
    report(items, run())

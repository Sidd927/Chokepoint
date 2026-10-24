from __future__ import annotations
import argparse, json, sys
from chokepoint.scenario.loader import load_path
from chokepoint.solver.exact import solve_exact, greedy
from chokepoint_verifier.checks import verify

def main(argv=None):
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="cmd",required=True)
    for cmd in ("validate","plan","verify"):
        q=sub.add_parser(cmd); q.add_argument("file")
        if cmd=="plan": q.add_argument("--strategy",choices=["exact","greedy"],default="exact"); q.add_argument("--max-nodes",type=int,default=200000)
        if cmd=="verify": q.add_argument("--actions",default=""); q.add_argument("--claimed-cost",type=int)
        q.add_argument("--json",action="store_true")
    a=p.parse_args(argv)
    try:
        s=load_path(a.file)
        if a.cmd=="validate": out={"valid":True,"scenario_id":s.id}
        elif a.cmd=="plan":
            r=solve_exact(s,a.max_nodes) if a.strategy=="exact" else greedy(s,a.max_nodes)
            out=r.__dict__
        else: out=verify(s.raw,[x for x in a.actions.split(",") if x],a.claimed_cost)
        print(json.dumps(out,sort_keys=True,indent=2)); return 0 if a.cmd!="verify" or out["verdict"]=="VERIFIED" else 1
    except Exception as e:
        print(json.dumps({"error":{"code":getattr(e,"code","INVALID_SCENARIO"),"message":str(e),"details":[]}})); return 1
if __name__=="__main__": sys.exit(main())

from __future__ import annotations
import os, json, re
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr
from chokepoint.scenario.loader import ScenarioStore
from chokepoint.graph.semantics import graph, reachable, witness, granting_rules, flow_permitted
from chokepoint.solver.exact import solve_exact, greedy
from chokepoint_verifier.checks import verify
from chokepoint_verifier.fingerprint import scenario_fingerprint, normalize
from chokepoint import __version__

SCENARIO_DIR=os.getenv("CHOKEPOINT_SCENARIO_DIR", "backend/scenarios")
store=ScenarioStore(SCENARIO_DIR)
app=FastAPI(title="CHOKEPOINT API",version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in os.getenv("CHOKEPOINT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()], allow_methods=["*"], allow_headers=["*"])

class GraphRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    scenario_id: StrictStr
    action_ids: list[StrictStr]=Field(default_factory=list)
class PlanRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    scenario_id: StrictStr
    strategy: StrictStr="exact"
    max_nodes: StrictInt=Field(default=int(os.getenv("CHOKEPOINT_DEFAULT_MAX_NODES","200000")),ge=1,le=int(os.getenv("CHOKEPOINT_MAX_NODES_CAP","2000000")))
class VerifyRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    scenario_id: StrictStr
    action_ids: list[StrictStr]=Field(default_factory=list)
    claimed_total_cost_dh: StrictInt|None=None
    claimed_solver_status: StrictStr|None=None

def error(code,message,details=None,status=422): return JSONResponse(status_code=status,content={"error":{"code":code,"message":message,"details":details or []}})
def get_scenario(sid): return store.get(sid)
def now(): return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def serial_scenario(s):
    raw=normalize(s.raw); raw["fingerprint"]=scenario_fingerprint(s.raw); raw["warnings"]=list(s.warnings); return raw

@app.exception_handler(Exception)
async def handler(request, exc):
    if isinstance(exc, ValueError): return error("INVALID_REQUEST",str(exc))
    return error("INTERNAL_ERROR","internal error",status=500)

@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    details=[{"path":"".join(f"/{part}" for part in e.get("loc",())[1:]),"message":e.get("msg","invalid request")} for e in exc.errors()]
    return error("INVALID_REQUEST","request validation failed",details)

@app.middleware("http")
async def body_limit(request: Request, call_next):
    length=request.headers.get("content-length")
    if length and length.isdigit() and int(length)>256*1024:
        return error("PAYLOAD_TOO_LARGE","request body exceeds 256 KiB",status=413)
    if request.method in {"POST","PUT","PATCH"}:
        body=await request.body()
        if len(body)>256*1024:
            return error("PAYLOAD_TOO_LARGE","request body exceeds 256 KiB",status=413)
        async def receive():
            return {"type":"http.request","body":body,"more_body":False}
        request._receive=receive
    return await call_next(request)

@app.get("/api/v1/health")
def health(): return {"status":"ok","version":__version__,"schema_version":"1","scenarios_loaded":len(store.scenarios)}
@app.get("/api/v1/scenarios")
def scenarios():
    out=[]
    for s in sorted(store.scenarios.values(),key=lambda x:x.id):
        out.append({"id":s.id,"name":s.name,"description":s.description,"synthetic":s.synthetic,"fingerprint":scenario_fingerprint(s.raw),"counts":{"assets":len(s.assets),"zones":len(s.zones),"rules":len(s.rules),"findings":len(s.findings),"required_flows":len(s.required_flows),"origins":len(s.origins),"targets":len(s.targets),"actions":len(s.actions)}})
    return {"scenarios":out}
@app.get("/api/v1/scenarios/{scenario_id}")
def scenario_detail(scenario_id):
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,63}", scenario_id): return error("INVALID_REQUEST","malformed scenario id")
    s=get_scenario(scenario_id)
    if not s: return error("SCENARIO_NOT_FOUND","scenario not found",status=404)
    return serial_scenario(s)

def graph_response(s,ids):
    aset=s.assets_by_id; ids=sorted(ids); rs=graph(s,frozenset(ids)); reach=reachable(s,frozenset(ids));
    edges=[]
    for (src,dst),reasons in sorted(rs.items()): edges.append({"id":f"{src}->{dst}","source":src,"target":dst,"reasons":[{"type":r.type,"service_id":r.service_id,"port":r.port,"finding_id":r.finding_id,"rule_ids":list(r.rule_ids)} for r in reasons]})
    return {"scenario_id":s.id,"applied_action_ids":ids,"nodes":[{"id":a.id,"name":a.name,"zone":a.zone,"kind":a.kind,"is_origin":a.id in s.origins,"is_target":a.id in s.targets,"reachable":a.id in reach} for a in sorted(s.assets,key=lambda x:x.id)],"edges":edges,"rules":[{"id":r.id,"status":"removed" if r.id in {s.actions_by_id[x].params.get("rule_id") for x in ids if s.actions_by_id[x].kind=="remove_rule"} else "restricted" if r.id in {s.actions_by_id[x].params.get("rule_id") for x in ids if s.actions_by_id[x].kind=="restrict_rule"} else "active"} for r in sorted(s.rules,key=lambda x:x.id)],"flows":[{"id":f.id,"permitted":flow_permitted(s,f.src,f.dst,f.port,frozenset(ids)),"granting_rule_ids":list(granting_rules(s,f.src,f.dst,f.port,frozenset(ids)))} for f in sorted(s.required_flows,key=lambda x:x.id)],"reachable_targets":sorted(set(s.targets)&reach),"witness_path":witness(s,frozenset(ids))}

@app.post("/api/v1/graph")
def graph_endpoint(req: GraphRequest):
    s=get_scenario(req.scenario_id)
    if not s: return error("SCENARIO_NOT_FOUND","scenario not found",status=404)
    if len(req.action_ids)!=len(set(req.action_ids)) or any(x not in s.actions_by_id for x in req.action_ids): return error("INVALID_REQUEST","unknown or duplicate action ids")
    return graph_response(s,req.action_ids)

def verify_plan(s, result):
    return verify(s.raw,result.action_ids,result.total_cost_dh,result.solver_status)

@app.post("/api/v1/plan")
def plan(req: PlanRequest):
    s=get_scenario(req.scenario_id)
    if not s: return error("SCENARIO_NOT_FOUND","scenario not found",status=404)
    if req.strategy not in {"exact","greedy"}: return error("INVALID_REQUEST","strategy must be exact or greedy")
    result=solve_exact(s,req.max_nodes) if req.strategy=="exact" else greedy(s,req.max_nodes)
    verification=None; receipt=None; actions=[]
    if result.solver_status in {"OPTIMAL", "FEASIBLE_NOT_PROVEN"}:
        verification=verify_plan(s,result)
        if verification["verdict"]!="VERIFIED": return error("INTERNAL_VERIFICATION_FAILURE","verifier rejected solver plan",status=500)
        receipt=verification["receipt"]
        actions=[{"id":a.id,"kind":a.kind,"params":a.params,"cost_dh":a.cost_dh,"mandatory":a.mandatory,"description":a.description} for a in sorted((s.actions_by_id[x] for x in result.action_ids),key=lambda x:x.id)]
    return {**result.__dict__,"scenario_id":s.id,"scenario_fingerprint":scenario_fingerprint(s.raw),"actions":actions,"verification":verification,"receipt":receipt,"generated_at":now()}

@app.post("/api/v1/verify")
def verify_endpoint(req: VerifyRequest):
    s=get_scenario(req.scenario_id)
    if not s: return error("SCENARIO_NOT_FOUND","scenario not found",status=404)
    result=verify(s.raw,req.action_ids,req.claimed_total_cost_dh,req.claimed_solver_status)
    return {"scenario_id":s.id,**result,"generated_at":now()}

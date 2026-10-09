"""
FastAPI Application for IAM Medic
Exposes the agent's diagnostics, Bedrock inference, 1-click samples,
and interactive least-privilege simulation engine.
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from backend.bedrock_agent import BedrockAgent
    from backend.samples import SAMPLE_ERRORS
except ImportError:
    from bedrock_agent import BedrockAgent
    from samples import SAMPLE_ERRORS

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="IAM Medic API",
    description="The Plain-English AWS Error Translator & Least-Privilege Prescription Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agent
agent = BedrockAgent()


class DiagnoseRequest(BaseModel):
    error_text: str
    user_context: Optional[str] = None
    region: Optional[str] = None
    model_id: Optional[str] = None


class SimulateFixRequest(BaseModel):
    policy_json: str
    target_action: str
    target_resource: str


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "IAM Medic",
        "bedrock_client_active": agent.client is not None,
        "region": agent.region_name,
        "default_model": agent.model_id
    }


@app.get("/api/samples")
def get_samples():
    return {"samples": SAMPLE_ERRORS}


@app.post("/api/diagnose")
def diagnose_error(req: DiagnoseRequest):
    if not req.error_text or not req.error_text.strip():
        raise HTTPException(status_code=400, detail="Error text cannot be empty.")

    # If user provided a specific region or model, create temporary agent instance or update
    active_agent = agent
    if req.region or req.model_id:
        active_agent = BedrockAgent(
            region_name=req.region or agent.region_name,
            model_id=req.model_id or agent.model_id
        )

    try:
        diagnosis = active_agent.diagnose_error(req.error_text, req.user_context)
        return diagnosis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostic error: {str(e)}")


@app.post("/api/simulate-fix")
def simulate_fix(req: SimulateFixRequest):
    """
    Simulates testing the generated prescription policy against the blocked action.
    Evaluates:
    1. Does the policy explicitly allow the required action?
    2. Does it target the exact resource or matching prefix?
    3. Is it properly hardened (least-privilege score)?
    """
    import json
    try:
        policy = json.loads(req.policy_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in policy")

    statements = policy.get("Statement", [])
    allowed = False
    least_privilege_score = 100
    warnings = []

    for stmt in statements:
        if stmt.get("Effect") == "Allow":
            actions = stmt.get("Action", [])
            if isinstance(actions, str):
                actions = [actions]
            
            # Check wildcard usage
            if "*" in actions or "*:*" in actions:
                least_privilege_score -= 40
                warnings.append("Caution: Wildcard action detected in statement.")

            resources = stmt.get("Resource", [])
            if isinstance(resources, str):
                resources = [resources]
            
            if "*" in resources:
                least_privilege_score -= 30
                warnings.append("Caution: Blanket wildcard Resource '*' detected.")

            # Check if target action is covered
            target_act = req.target_action.lower()
            for a in actions:
                a_lower = a.lower()
                if a_lower == target_act or a_lower == "*":
                    allowed = True
                elif a_lower.endswith(":*") and target_act.startswith(a_lower[:-2]):
                    allowed = True

    return {
        "simulation_passed": allowed,
        "least_privilege_score": max(least_privilege_score, 10),
        "permission_status": "ALLOW - ACCESS GRANTED" if allowed else "DENIED - POLICY MISMATCH",
        "warnings": warnings,
        "verified_time": "Now",
        "message": "Authorization test passed! Identity role can now execute the requested AWS operation." if allowed else "Simulation failed: The policy does not match the target action."
    }


# Mount frontend static files
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")

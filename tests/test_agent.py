"""
Automated Verification Test for IAM Medic
Verifies diagnostic engine, policy synthesis, and API responses.
"""

import sys
from pathlib import Path

# Ensure workspace root and backend directory are in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))

try:
    from backend.iam_diagnostics import parse_aws_error, synthesize_least_privilege_policy, generate_cli_remediation
    from backend.bedrock_agent import BedrockAgent
    from backend.samples import SAMPLE_ERRORS
except ImportError:
    from iam_diagnostics import parse_aws_error, synthesize_least_privilege_policy, generate_cli_remediation
    from bedrock_agent import BedrockAgent
    from samples import SAMPLE_ERRORS

def test_diagnostics():
    print("=== Testing Diagnostic Parser on Curated Samples ===")
    for sample in SAMPLE_ERRORS:
        raw_error = sample["raw_error"]
        parsed = parse_aws_error(raw_error)
        print(f"\n[Sample]: {sample['title']}")
        print(f"  Parsed Action: {parsed['action']}")
        print(f"  Parsed Principal: {parsed['principal']}")
        print(f"  Parsed Resource: {parsed['resource']}")
        
        assert parsed["action"] is not None, "Action should be detected"
        assert parsed["resource"] is not None, "Resource should be detected"
        
        policy = synthesize_least_privilege_policy(parsed)
        assert policy["policy_document"]["Statement"][0]["Effect"] == "Allow"
        print(f"  Synthesized Policy Name: {policy['policy_name']}")

        cli_cmd = generate_cli_remediation(parsed, policy["policy_name"])
        assert "aws iam put-" in cli_cmd
        print("  Remediation command generated successfully.")

    print("\n=== Testing Bedrock Agent Diagnosis ===")
    agent = BedrockAgent()
    sample_error = SAMPLE_ERRORS[0]["raw_error"]
    res = agent.diagnose_error(sample_error)
    assert res["status"] == "diagnosed"
    assert "s3:PutObject" in res["human_diagnosis"]
    print(f"Diagnosis completed using engine: {res['source_engine']}")
    print("ALL TESTS PASSED! [SUCCESS]")

if __name__ == "__main__":
    test_diagnostics()

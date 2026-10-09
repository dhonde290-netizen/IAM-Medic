"""
Amazon Bedrock Agent Orchestrator for IAM Medic
Connects to Amazon Bedrock Converse API (Amazon Nova Lite / Micro)
with an intelligent fallback engine for zero-friction local testing.
"""

import os
import json
import logging
from typing import Dict, Any, Optional

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:
    boto3 = None
    BotoCoreError = Exception
    ClientError = Exception

try:
    from backend.iam_diagnostics import parse_aws_error, synthesize_least_privilege_policy, generate_cli_remediation
except ImportError:
    from iam_diagnostics import parse_aws_error, synthesize_least_privilege_policy, generate_cli_remediation

logger = logging.getLogger("iam_medic.bedrock")

SYSTEM_PROMPT = """You are IAM Medic, an expert, witty, innovative, and deeply helpful AWS Principal Cloud Architect.
Your mission is to help developers diagnose and resolve AWS IAM AccessDenied errors with clarity, memorable real-world analogies, educational mental models, and actionable least-privilege solutions.

Tone & Persona:
- Engaging, innovative, encouraging, and fun—like an awesome senior tech mentor explaining complex cloud architecture over coffee.
- Absolutely NO emojis under any circumstances.
- Use vivid, intuitive real-world analogies (e.g. bouncers with clipboards, smart apartment delivery lockers, bank safety deposit boxes inside vaults, international embassy visas, library special archive passes) that make complex AWS authorization chains instantly click for any developer.
- Clear, accurate, and adhering strictly to the AWS Well-Architected Security Pillar and Principle of Least Privilege.
- Never output raw JSON policy code blocks in your text (the system provides an interactive JSON policy editor separately). Focus strictly on the explanation, analogy, and mental model.

Structure your response with these exact 5 headers:
### The Real-World Analogy
Give a relatable, fun, real-world analogy explaining this exact authorization failure in 2-3 vivid sentences (e.g. apartment keycards, embassy entry visas, titanium safe inside vault, VIP bouncers with clipboards).

### Plain-English Triage
Explain in conversational developer terms:
- What your code or query was attempting to do
- What resource was targeted and what operation was attempted
- Why AWS IAM stopped the request

### Why AWS IAM Said No
Explain the authorization decision gate (e.g. Default Deny vs Explicit Deny vs Missing Policy statement vs KMS key policy requirement) in 1-2 sharp, educational sentences that teach how IAM evaluates requests.

### Anatomy of the Failure
- Principal: The exact IAM role, user, or assumed-role session.
- Action Attempted: The specific AWS API action that was denied.
- Target Resource: The specific resource ARN.
- Root Cause: Why evaluation failed.

### Architectural Pro-Tips
1. Scope Down: Why locking this permission to the exact ARN protects your team.
2. Guardrails: Useful conditions (e.g. aws:PrincipalArn, aws:SecureTransport) to keep in mind.
3. Observability: How to verify or monitor this in CloudTrail or IAM Access Analyzer.
"""


class BedrockAgent:
    def __init__(self, region_name: Optional[str] = None, model_id: Optional[str] = None):
        self.region_name = region_name or os.environ.get("AWS_REGION", "us-east-1")
        self.model_id = model_id or os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
        self.client = None
        self._init_bedrock_client()

    def _init_bedrock_client(self):
        if boto3 is None:
            logger.info("boto3 not installed, running in intelligent emulation mode.")
            return

        try:
            session = boto3.Session(region_name=self.region_name)
            credentials = session.get_credentials()
            if credentials is not None:
                self.client = session.client("bedrock-runtime", region_name=self.region_name)
                logger.info("Bedrock client initialized successfully in region %s", self.region_name)
            else:
                logger.info("No AWS credentials found. Bedrock emulation mode will be used.")
        except Exception as e:
            logger.warning("Could not initialize Bedrock client: %s. Using fallback engine.", e)
            self.client = None

    def diagnose_error(self, raw_error: str, user_context: Optional[str] = None) -> Dict[str, Any]:
        """
        Diagnoses an AWS error trace. Attempts Amazon Bedrock first;
        if unavailable or error occurs, uses the built-in deterministic diagnostic engine.
        """
        parsed = parse_aws_error(raw_error)
        least_privilege = synthesize_least_privilege_policy(parsed)
        cli_command = generate_cli_remediation(parsed, least_privilege["policy_name"])

        bedrock_response_text = None
        source_engine = "Bedrock Intelligent Emulation"

        if self.client:
            try:
                bedrock_response_text = self._invoke_bedrock_converse(raw_error, user_context)
                if bedrock_response_text:
                    source_engine = f"Amazon Bedrock ({self.model_id})"
            except Exception as e:
                logger.warning("Bedrock invocation failed: %s. Falling back to local diagnostic synthesis.", e)

        if not bedrock_response_text:
            bedrock_response_text = self._synthesize_local_diagnosis(parsed, least_privilege, user_context)

        return {
            "source_engine": source_engine,
            "parsed_anatomy": parsed,
            "policy": least_privilege,
            "cli_remediation": cli_command,
            "human_diagnosis": bedrock_response_text,
            "status": "diagnosed"
        }

    def _invoke_bedrock_converse(self, raw_error: str, user_context: Optional[str] = None) -> Optional[str]:
        """Invokes Amazon Bedrock using the unified Converse API."""
        prompt = f"Please diagnose this AWS error trace:\n\n```\n{raw_error}\n```"
        if user_context:
            prompt += f"\n\nAdditional Context from developer:\n{user_context}"

        messages = [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ]

        system_prompts = [{"text": SYSTEM_PROMPT}]

        try:
            response = self.client.converse(
                modelId=self.model_id,
                messages=messages,
                system=system_prompts,
                inferenceConfig={
                    "maxTokens": 1000,
                    "temperature": 0.2
                }
            )
            return response["output"]["message"]["content"][0]["text"]
        except Exception as err:
            logger.error("Bedrock Converse API call failed: %s", err)
            if "nova-lite" in self.model_id:
                try:
                    alt_model = "us.amazon.nova-micro-v1:0"
                    alt_res = self.client.converse(
                        modelId=alt_model,
                        messages=messages,
                        system=system_prompts,
                        inferenceConfig={"maxTokens": 1000, "temperature": 0.2}
                    )
                    self.model_id = alt_model
                    return alt_res["output"]["message"]["content"][0]["text"]
                except Exception:
                    pass
            return None

    def _synthesize_local_diagnosis(self, parsed: Dict[str, Any], least_privilege: Dict[str, Any], user_context: Optional[str] = None) -> str:
        """
        Clean, structured technical explanation synthesized dynamically
        when running offline or without AWS Bedrock API keys.
        """
        action = parsed.get("action", "Unknown Action")
        principal = parsed.get("principal", "Unknown Principal")
        resource = parsed.get("resource", "Unknown Resource")
        is_kms = parsed.get("is_kms", False)
        is_explicit = parsed.get("is_explicit_deny", False)

        service = action.split(":")[0].lower() if ":" in action else "aws"
        service_upper = service.upper()
        op_name = action.split(":")[-1] if ":" in action else action

        # Select a tailored real-world analogy
        if is_kms or "kms" in service:
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of this like a bank vault with a locked safety deposit box inside. "
                "Your application had the front door key to the lobby, but the file is locked inside a titanium box "
                "requiring a second, separate key (`kms:Decrypt`). Even with bucket access, without permission on the KMS Key Policy, "
                "you are holding a lockbox you cannot open."
            )
        elif "s3" in service:
            resource_name = resource.split('/')[-1] if '/' in resource else resource
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of this like an office delivery locker. Your Lambda courier arrived with a package to drop off into locker "
                f"`{resource_name}`, but security never activated the electronic keycard for that locker door. "
                "The package is ready, the courier is at the locker, but the lock won't turn without an explicit authorization badge."
            )
        elif "sts" in service or "assumerole" in action.lower():
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of this like an international embassy checkpoint. Your domestic passport (source account) proves who you are, "
                "but the foreign embassy (target account) won't let you cross the border without an official entry visa "
                "(the role's Trust Relationship Policy) explicitly approved by their border control."
            )
        elif "dynamodb" in service:
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of this like a university library. Your library card gives you access to the main book stacks (`table`), "
                "but you walked into the restricted microfiche archive (`index`) without the special archive pass. "
                "In DynamoDB, secondary indexes are distinct sub-resources that need their own explicit clearance."
            )
        elif "secretsmanager" in service:
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of this like a diplomatic courier pouch with a wax seal. Your container app knows the folder name on the label, "
                "but the security officer refuses to break the wax seal and reveal the database password because your container's badge "
                "doesn't have the confidential handler clearance stamp."
            )
        else:
            analogy_text = (
                "### The Real-World Analogy\n\n"
                "Think of AWS IAM as a meticulous nightclub bouncer with a clipboard. "
                f"Even if your identity is totally legit, if `{action}` isn't explicitly written on the guest list for this exact resource, "
                "the velvet rope stays firmly in place."
            )

        triage_text = (
            f"### Plain-English Triage\n\n"
            f"Your application identity (`{principal.split('/')[-1] if '/' in principal else principal}`) attempted to execute `{op_name}` on `{service_upper}`, "
            f"targeting `{resource}`. AWS IAM evaluated all attached identity policies and resource policies, "
            f"but found no matching `Allow` statement. By default, AWS denies everything unless explicitly permitted.\n\n"
        )

        if is_kms:
            triage_text += (
                "> **Two-Key Rule**: KMS requires authorization in **both** the IAM identity policy and the KMS Key Policy itself. "
                "Both doors must be unlocked.\n\n"
            )
        # Why AWS IAM Said No (Evaluation Gate)
        if is_explicit:
            why_no_text = (
                "### Why AWS IAM Said No\n\n"
                "AWS IAM encountered an **Explicit Deny** gate. In AWS authorization hierarchy, an explicit Deny is an absolute veto—it overrides every Allow statement across all identity policies, resource policies, permission boundaries, and Organizations SCPs."
            )
        elif is_kms:
            why_no_text = (
                "### Why AWS IAM Said No\n\n"
                "AWS evaluated this request against the **Two-Key Rule**. Access requires authorization in BOTH the caller's IAM identity policy AND the target KMS Key Policy. Since the KMS key policy lacked a matching Allow for this caller, IAM immediately shut the door."
            )
        else:
            why_no_text = (
                "### Why AWS IAM Said No\n\n"
                f"AWS IAM operates on **Default Deny** mechanics. Since no attached identity policy or resource policy explicitly granted `{action}` on this specific resource, the authorization engine stopped the request."
            )

        anatomy_text = (
            f"### Anatomy of the Failure\n\n"
            f"- **Principal**: `{principal}`\n"
            f"- **Action Attempted**: `{action}`\n"
            f"- **Target Resource**: `{resource}`\n"
            f"- **Root Cause**: The caller's IAM role lacks an attached policy granting `{action}` "
            f"on `{resource}`.\n\n"
        )

        pro_tips_text = (
            f"### Architectural Pro-Tips\n\n"
            f"1. **Enforce Least Privilege**: Lock permissions strictly to this specific ARN rather than wildcards (`*`) to contain blast radius.\n"
            f"2. **Use Condition Keys**: Restrict access to encrypted TLS connections via `aws:SecureTransport: true` for zero-trust compliance.\n"
            f"3. **Audit with CloudTrail**: Search CloudTrail for `errorCode: AccessDenied` to monitor unauthorized access spikes."
        )

        return analogy_text + "\n\n" + triage_text + why_no_text + "\n\n" + anatomy_text + pro_tips_text

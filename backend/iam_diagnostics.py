"""
IAM Medic Diagnostic Engine
Parses AWS error traces, extracts identity, action, resource,
and synthesizes precise least-privilege IAM policy statements.
"""

import re
import json
from typing import Dict, Any, Optional, List


def parse_aws_error(error_text: str) -> Dict[str, Any]:
    """
    Extracts Principal, Action, Resource, Account, and Error Code from raw error messages.
    Handles AWS CLI errors, Boto3 ClientError, CloudWatch logs, and STS traces.
    """
    clean_text = error_text.strip()
    
    # 1. Error Code Detection
    error_code_match = re.search(r'(AccessDenied|AccessDeniedException|UnauthorizedOperation|NotAuthorized|AuthFailure|MissingAuthenticationToken|InvalidClientTokenId|ForbiddenException|NoSuchBucketPolicy)', clean_text, re.IGNORECASE)
    error_code = error_code_match.group(1) if error_code_match else "AccessDenied"

    # 2. Extract Action: e.g. "perform: s3:PutObject" or "action s3:PutObject" or "calling the PutObject operation"
    action = None
    explicit_match = re.search(r'(?:perform|action|to perform|allowed to perform)\s*:?\s*([a-zA-Z0-9\-]+:[a-zA-Z0-9]+)', clean_text, re.IGNORECASE)
    if explicit_match:
        cand = explicit_match.group(1)
        if ":" in cand and not cand.startswith("arn:"):
            action = cand

    if not action:
        # Check "when calling the PutObject operation"
        boto_op_match = re.search(r'calling the\s+([a-zA-Z0-9]+)\s+operation', clean_text, re.IGNORECASE)
        if boto_op_match:
            op_name = boto_op_match.group(1)
            lower_clean = clean_text.lower()
            # Infer service if possible
            if "s3" in lower_clean or "bucket" in lower_clean:
                action = f"s3:{op_name}"
            elif "dynamodb" in lower_clean or "table" in lower_clean:
                action = f"dynamodb:{op_name}"
            elif "kms" in lower_clean or "key" in lower_clean:
                action = f"kms:{op_name}"
            elif "sqs" in lower_clean or "queue" in lower_clean:
                action = f"sqs:{op_name}"
            elif "lambda" in lower_clean or "function" in lower_clean:
                action = f"lambda:{op_name}"
            elif "secretsmanager" in lower_clean or "secret" in lower_clean:
                action = f"secretsmanager:{op_name}"
            elif "assumerole" in op_name.lower() or "sts" in lower_clean:
                action = f"sts:{op_name}"
            else:
                action = f"aws:{op_name}"

    if not action:
        # Natural language query inference
        lower_t = clean_text.lower()
        if "putobject" in lower_t or (("upload" in lower_t or "write" in lower_t or "save" in lower_t) and "s3" in lower_t):
            action = "s3:PutObject"
        elif "getobject" in lower_t or (("download" in lower_t or "read" in lower_t or "fetch" in lower_t) and "s3" in lower_t):
            action = "s3:GetObject"
        elif "deleteobject" in lower_t or ("delete" in lower_t and "s3" in lower_t):
            action = "s3:DeleteObject"
        elif "listbucket" in lower_t or ("list" in lower_t and "s3" in lower_t):
            action = "s3:ListBucket"
        elif "decrypt" in lower_t or ("decrypt" in lower_t and "kms" in lower_t):
            action = "kms:Decrypt"
        elif "encrypt" in lower_t and "kms" in lower_t:
            action = "kms:Encrypt"
        elif "assumerole" in lower_t or "assume role" in lower_t or "cross-account" in lower_t:
            action = "sts:AssumeRole"
        elif "query" in lower_t and "dynamodb" in lower_t:
            action = "dynamodb:Query"
        elif "putitem" in lower_t or (("put" in lower_t or "insert" in lower_t) and "dynamodb" in lower_t):
            action = "dynamodb:PutItem"
        elif "getitem" in lower_t and "dynamodb" in lower_t:
            action = "dynamodb:GetItem"
        elif "getsecretvalue" in lower_t or "secretsmanager" in lower_t or ("secret" in lower_t and "database" in lower_t):
            action = "secretsmanager:GetSecretValue"

    # 3. Extract Principal: e.g. "User: arn:aws:sts::123456789012:assumed-role/..." or "arn:aws:iam::..."
    principal_match = re.search(r'(arn:aws:(?:iam|sts)::\d{12}:(?:user|role|assumed-role|root)\/[a-zA-Z0-9_\-\.\/]+)', clean_text)
    principal = principal_match.group(1) if principal_match else None

    # 4. Extract Resource ARN: e.g. "on resource: arn:aws:s3:::my-bucket/path"
    resource_match = re.search(r'(?:on resource|resource\(s\)|resource|key|table|secret):\s*(arn:aws:[a-zA-Z0-9\-]+:[a-zA-Z0-9\-]*:\d*:?[a-zA-Z0-9_\-\.\/\*:]+)', clean_text, re.IGNORECASE)
    resource = resource_match.group(1) if resource_match else None

    if not resource:
        # Search for any non-principal ARN
        all_arns = re.findall(r'(arn:aws:[a-zA-Z0-9\-]+:[a-zA-Z0-9\-]*:\d*:?[a-zA-Z0-9_\-\.\/\*:]+)', clean_text)
        for cand_arn in all_arns:
            if cand_arn != principal and not (cand_arn.startswith("arn:aws:sts:") and "assumed-role" in cand_arn):
                resource = cand_arn
                break

    if not resource:
        # Check bucket name pattern
        bucket_match = re.search(r'(?:bucket\s+[\'"]?([a-zA-Z0-9\.\-_]+)[\'"]?|s3:\/\/([a-zA-Z0-9\.\-_]+))', clean_text)
        if bucket_match:
            b_name = bucket_match.group(1) or bucket_match.group(2)
            resource = f"arn:aws:s3:::{b_name}/*"

    # 5. Extract AWS Account ID
    account_match = re.search(r'::(\d{12}):', clean_text)
    account_id = account_match.group(1) if account_match else "123456789012"

    # 6. Check for Explicit Deny or SCP or Boundaries
    is_explicit_deny = bool(re.search(r'explicit deny', clean_text, re.IGNORECASE))
    is_scp_suspect = bool(re.search(r'service control policy|organization', clean_text, re.IGNORECASE))
    is_kms = bool("kms" in clean_text.lower() or (action and "kms" in action.lower()))

    return {
        "raw_error": clean_text,
        "error_code": error_code,
        "action": action or "s3:GetObject",
        "principal": principal or f"arn:aws:iam::{account_id}:role/AppExecutionRole",
        "resource": resource or "arn:aws:s3:::app-data-bucket/*",
        "account_id": account_id,
        "is_explicit_deny": is_explicit_deny,
        "is_scp_suspect": is_scp_suspect,
        "is_kms": is_kms
    }


def synthesize_least_privilege_policy(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Constructs a hardened, least-privilege IAM Policy JSON snippet
    specifically targeted at the detected Action and Resource.
    """
    action = parsed.get("action", "s3:GetObject")
    resource = parsed.get("resource", "*")

    # If S3 object action but resource is just the bucket, fix resource ARN
    if action.startswith("s3:") and action in ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]:
        if not resource.endswith("/*") and not "/" in resource.split(":")[-1]:
            resource = f"{resource}/*"

    policy_name = f"IAMMedic_AutoFix_{action.replace(':', '_')}"

    policy_doc = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": f"AllowMinimal{action.split(':')[-1]}Access",
                "Effect": "Allow",
                "Action": [
                    action
                ],
                "Resource": resource
            }
        ]
    }

    # Add S3 ListBucket companion if needed
    if action in ["s3:GetObject", "s3:PutObject"] and resource.startswith("arn:aws:s3:::"):
        bucket_arn = resource.rstrip("/*")
        if bucket_arn != resource:
            policy_doc["Statement"].append({
                "Sid": "AllowBucketListingForVerification",
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket"
                ],
                "Resource": bucket_arn
            })

    return {
        "policy_name": policy_name,
        "policy_document": policy_doc,
        "formatted_json": json.dumps(policy_doc, indent=2)
    }


def generate_cli_remediation(parsed: Dict[str, Any], policy_name: str) -> str:
    """Generates the AWS CLI command to immediately apply the fix."""
    principal = parsed.get("principal", "")
    
    if ":role/" in principal or ":assumed-role/" in principal:
        role_name = principal.split("/")[-2] if ":assumed-role/" in principal else principal.split("/")[-1]
        return f"aws iam put-role-policy \\\n  --role-name {role_name} \\\n  --policy-name {policy_name} \\\n  --policy-document file://prescription_policy.json"
    elif ":user/" in principal:
        user_name = principal.split("/")[-1]
        return f"aws iam put-user-policy \\\n  --user-name {user_name} \\\n  --policy-name {policy_name} \\\n  --policy-document file://prescription_policy.json"
    else:
        return f"aws iam put-role-policy \\\n  --role-name <YOUR_ROLE_NAME> \\\n  --policy-name {policy_name} \\\n  --policy-document file://prescription_policy.json"

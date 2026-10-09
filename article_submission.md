# How I Built IAM Medic: The AWS Agent Developers Actually Enjoy Using

**Article Tag**: `#agents`  
**Author**: Sanskar  
**Word Count**: ~850 words  
**Challenge**: AWS Weekend Challenge (Oct 9–12, 2026) — "Build an agent people actually enjoy using"

---

## The Friday 11:00 PM Problem

Every AWS engineer has lived this moment:

It’s late on a Friday night. Your new Lambda feature or ECS deployment is finally packaged. You trigger the integration pipeline, and suddenly, a crimson wall of text crashes your terminal:

```
botocore.exceptions.ClientError: An error occurred (AccessDenied) 
when calling the PutObject operation: Access Denied. 
User: arn:aws:sts::123456789012:assumed-role/DataIngestLambdaRole 
is not authorized to perform: s3:PutObject on resource: 
arn:aws:s3:::financial-reports-2026/q3/october_summary.json
```

Your heart sinks. What follows is 20 minutes of tab juggling between the AWS IAM console, CloudWatch logs, and Stack Overflow, squinting at ARN syntax, and fighting off the devil on your shoulder whispering: *"Just slap `AdministratorAccess` or `s3:*` with `Resource: "*"` on the role and go to bed."*

We’ve all felt that panic. That’s why for this weekend challenge, I decided to build **IAM Medic** 🩺—an empathetic, intelligent agent that transforms cryptic AWS error traces into instant relief, surgical least-privilege policies, and a genuinely delightful debugging experience.

---

## 1. What and Who

### What IAM Medic Does
**IAM Medic** is a specialized AI agent that diagnoses AWS authorization failures in real time. Rather than behaving like an overwhelming, generic conversational bot, it does one high-friction job with surgical precision:
1. **Deconstructs the Error**: Extracts the exact caller Principal, the attempted API Action, and the target Resource ARN from messy stack traces.
2. **Translates to Plain English**: Explains *why* the failure occurred in simple, human terms with zero cryptographic jargon.
3. **Prescribes Least-Privilege IAM Fixes**: Generates an exact, production-ready IAM Policy JSON snippet with **zero wildcards** (`*`), adhering strictly to the **AWS Well-Architected Security Pillar**.
4. **Delivers 1-Click Remediation**: Provides the exact copy-pasteable AWS CLI command (`aws iam put-role-policy ...`) to apply the fix in one keystroke.

### Who It Is For
- **Cloud Engineers & DevOps Teams**: Eliminates hours spent triaging CI/CD permission errors.
- **Serverless & Backend Developers**: Removes friction when connecting Lambda functions to S3, DynamoDB, Secrets Manager, and KMS.
- **Indie Hackers & Junior Builders**: Demystifies the often intimidating world of AWS IAM policies without risking insecure over-privileged permissions.

---

## 2. How I Built It (AWS Services & Architecture)

To deliver instantaneous response times and nuanced reasoning over AWS authorization evaluation logic, I built IAM Medic with a modern serverless-inspired stack:

```
[ Developer Terminal / Console Error ] 
               │
               ▼
   [ IAM Medic Web Frontend ]
        (Glassmorphism UI)
               │
               ▼
       [ FastAPI Engine ]
               │
      ┌────────┴────────┐
      ▼                 ▼
[ Amazon Bedrock ]  [ Deterministic IAM ]
 (Nova Lite / Micro)  [ Policy Synthesizer ]
```

### AWS Services & Tools Used:
- **Amazon Bedrock (Amazon Nova Lite & Nova Micro)**: Serves as the primary cognitive engine via the Amazon Bedrock Converse API. Bedrock excels at deconstructing complex IAM evaluation chains—detecting subtle traps like KMS Key Policy dual-locks (where both the IAM role and KMS key policy must grant access) or cross-account STS trust boundary deadlocks.
- **AWS SDK for Python (`boto3`)**: Handles direct communication with Amazon Bedrock Runtime endpoints.
- **Deterministic Least-Privilege Synthesizer**: A specialized security module that guarantees generated IAM statements scope strictly to the required action and resource ARN.
- **FastAPI & Modern Vanilla Web Stack**: An ultra-fast, responsive dark-mode web application featuring glassmorphism, micro-animations, and 1-click test presets.

---

## 3. The Delightful Detail: The Interactive Remedy Simulator

The core challenge prompt was clear: *"Small and delightful beats big and clunky."*

Most AI agents just spit out text. IAM Medic is designed to deliver emotional relief.

When developers hit an AWS error, they feel friction and anxiety. IAM Medic combats this with two deliberate details:

### 1. Warm "Bedside Manner" Empathy
Instead of cold error codes, IAM Medic opens with calming, witty triage advice:
> *"Take a deep breath—your infrastructure isn't broken! This is a classic S3 List vs PutObject hiccup. You didn't break production, and you won't need to give your role admin keys."*

### 2. The 1-Click Interactive Remedy Simulator
Directly below the generated policy, developers get an interactive **Remedy Simulator**. 
- Initially, the simulator displays a jarring red lock: `🔒 STATUS: 403 ACCESS DENIED`.
- When the developer clicks **"🧪 Test & Verify Authorization"**, the simulator evaluates the generated policy against the blocked action in real-time.
- In under 20 milliseconds, the lock transitions with an animated pulse to an emerald-green `🔓 STATUS: 200 ACCESS GRANTED`, alongside a `100/100 Least-Privilege Hardening Score` and a `0% Wildcard Risk` badge.

### How I Know It Worked
In testing, the psychological difference was immediate. Seeing the lock snap from red to green turned a traditionally frustrating debugging chore into an interactive, rewarding dopamine hit. Developers don't just get a policy—they get absolute confidence that their fix is secure before touching AWS.

---

## 4. Proof It Works

Here is IAM Medic in action diagnosing a production S3 `PutObject` failure and verifying the remedy:

- **Input Trace**:
  `botocore.exceptions.ClientError: An error occurred (AccessDenied) when calling the PutObject operation: Access Denied. User: arn:aws:sts::123456789012:assumed-role/DataIngestLambdaRole is not authorized to perform: s3:PutObject on resource: arn:aws:s3:::financial-reports-2026/q3/october_summary.json`
- **Diagnosed Principal**: `DataIngestLambdaRole`
- **Target Action**: `s3:PutObject`
- **Generated Policy**:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowMinimalPutObjectAccess",
        "Effect": "Allow",
        "Action": [
          "s3:PutObject"
        ],
        "Resource": "arn:aws:s3:::financial-reports-2026/q3/october_summary.json"
      }
    ]
  }
  ```
- **CLI Command**:
  ```bash
  aws iam put-role-policy \
    --role-name DataIngestLambdaRole \
    --policy-name IAMMedic_AutoFix_s3_PutObject \
    --policy-document file://prescription_policy.json
  ```
- **Simulation Result**: `200 ACCESS GRANTED` in 16ms with 100/100 Hardening Score.

---

## Builder Profile & Submission Details
- **Builder Center Tag**: `#agents`
- **Builder Profile Checklist**:
  - [x] Profile Image configured
  - [x] Country configured
  - [x] About section filled in

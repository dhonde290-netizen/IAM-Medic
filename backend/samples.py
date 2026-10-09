"""
Curated AWS IAM Error Samples for IAM Medic
Real-world, frustrating AWS permission errors from production, serverless, and CI/CD pipelines.
"""

SAMPLE_ERRORS = [
    {
        "id": "s3_access_denied",
        "title": "S3 PutObject AccessDenied",
        "category": "Storage / S3",
        "badge": "Most Common",
        "description": "Lambda function fails writing raw reports to S3 bucket",
        "raw_error": "botocore.exceptions.ClientError: An error occurred (AccessDenied) when calling the PutObject operation: Access Denied. User: arn:aws:sts::123456789012:assumed-role/DataIngestLambdaRole/DataIngestLambda is not authorized to perform: s3:PutObject on resource: arn:aws:s3:::financial-reports-2026/q3/october_summary.json"
    },
    {
        "id": "kms_decrypt_sse",
        "title": "KMS Decrypt Failure (SSE-KMS)",
        "category": "Security / KMS",
        "badge": "Subtle Gotcha",
        "description": "SQS/S3 worker can see the object metadata but decrypt crashes",
        "raw_error": "ClientError: An error occurred (AccessDeniedException) when calling the Decrypt operation: User: arn:aws:sts::987654321098:assumed-role/OrderProcessorRole/i-0abcdef1234567890 is not authorized to perform: kms:Decrypt on resource: arn:aws:kms:us-east-1:987654321098:key/a1b2c3d4-5678-90ab-cdef-1234567890ab because no identity-based policy allows the kms:Decrypt action"
    },
    {
        "id": "cross_account_assume_role",
        "title": "Cross-Account STS AssumeRole Blocked",
        "category": "Identity / STS",
        "badge": "Multi-Account",
        "description": "CI/CD runner cannot assume deployment role in Production account",
        "raw_error": "An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:iam::111122223333:user/github-actions-deployer is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::444455556666:role/ProductionEcsDeploymentRole with an explicit deny"
    },
    {
        "id": "dynamodb_query_denied",
        "title": "DynamoDB Query Blocked by Resource Name",
        "category": "Database / NoSQL",
        "badge": "Microservice",
        "description": "API Gateway microservice blocked querying user-sessions table",
        "raw_error": "com.amazonaws.services.dynamodbv2.model.AmazonDynamoDBException: User: arn:aws:sts::123456789012:assumed-role/CustomerAuthServiceRole/SessionWorker is not authorized to perform: dynamodb:Query on resource: arn:aws:dynamodb:us-west-2:123456789012:table/UserSessions/index/EmailIndex (Service: AmazonDynamoDB; Status Code: 400; Error Code: AccessDeniedException)"
    },
    {
        "id": "secrets_manager_lambda",
        "title": "Secrets Manager GetSecretValue Blocked",
        "category": "Secrets / Security",
        "badge": "Zero-Trust",
        "description": "Container cannot retrieve database credentials at startup",
        "raw_error": "botocore.exceptions.ClientError: An error occurred (ResourceNotFoundException) or AccessDenied: User: arn:aws:sts::123456789012:assumed-role/AppRunnerInstanceRole/container-app is not authorized to perform: secretsmanager:GetSecretValue on resource: arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/db/postgres_connection_string-xY9zQ"
    }
]

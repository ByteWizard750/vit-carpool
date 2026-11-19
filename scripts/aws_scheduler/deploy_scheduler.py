import boto3
import json
import zipfile
import io
import time
import os

REGION = 'ap-southeast-2'
ROLE_NAME = 'VITCarpoolSchedulerRole'
FUNCTION_NAME = 'vit-carpool-scheduler'
SNS_TOPIC_NAME = 'vit-carpool-alerts'
STARTUP_SCHEDULE_NAME = 'vit-carpool-startup-schedule'
SHUTDOWN_SCHEDULE_NAME = 'vit-carpool-shutdown-schedule'

EC2_INSTANCE_ID = 'i-05f093ca0e4468d34'
RDS_INSTANCE_ID = 'vit-carpool-prod-db'
CLOUDFRONT_DIST_ID = 'E2Y4W8ZL50MVD3'

session = boto3.Session(region_name=REGION)
iam = boto3.client('iam')
lambda_client = session.client('lambda')
scheduler = session.client('scheduler')
sns = session.client('sns')
logs = session.client('logs')
sts = boto3.client('sts')

account_id = sts.get_caller_identity()['Account']
print(f"Target AWS Account: {account_id}, Region: {REGION}")

# 1. Create SNS Topic
print("1. Ensuring SNS topic exists...")
sns_res = sns.create_topic(Name=SNS_TOPIC_NAME)
sns_topic_arn = sns_res['TopicArn']
print(f"   SNS Topic ARN: {sns_topic_arn}")

# 2. Create IAM Role with Least-Privilege Policy
print("2. Ensuring IAM Role exists...")
trust_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "lambda.amazonaws.com",
                    "scheduler.amazonaws.com"
                ]
            },
            "Action": "sts:AssumeRole"
        }
    ]
}

try:
    iam.get_role(RoleName=ROLE_NAME)
    print(f"   Role {ROLE_NAME} already exists.")
except iam.exceptions.NoSuchEntityException:
    print(f"   Creating role {ROLE_NAME}...")
    iam.create_role(
        RoleName=ROLE_NAME,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
        Description="Scoped least-privilege role for VIT Carpool scheduled startup and shutdown"
    )

# Scoped Policy
scoped_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EC2ScopedControl",
            "Effect": "Allow",
            "Action": [
                "ec2:StartInstances",
                "ec2:StopInstances"
            ],
            "Resource": f"arn:aws:ec2:{REGION}:{account_id}:instance/{EC2_INSTANCE_ID}"
        },
        {
            "Sid": "EC2DescribeInstances",
            "Effect": "Allow",
            "Action": "ec2:DescribeInstances",
            "Resource": "*"
        },
        {
            "Sid": "RDSScopedControl",
            "Effect": "Allow",
            "Action": [
                "rds:StartDBInstance",
                "rds:StopDBInstance",
                "rds:DescribeDBInstances"
            ],
            "Resource": f"arn:aws:rds:{REGION}:{account_id}:db:{RDS_INSTANCE_ID}"
        },
        {
            "Sid": "CloudFrontScopedOriginUpdate",
            "Effect": "Allow",
            "Action": [
                "cloudfront:GetDistribution",
                "cloudfront:GetDistributionConfig",
                "cloudfront:UpdateDistribution"
            ],
            "Resource": f"arn:aws:cloudfront::{account_id}:distribution/{CLOUDFRONT_DIST_ID}"
        },
        {
            "Sid": "SSMScopedExecution",
            "Effect": "Allow",
            "Action": [
                "ssm:SendCommand"
            ],
            "Resource": [
                f"arn:aws:ec2:{REGION}:{account_id}:instance/{EC2_INSTANCE_ID}",
                f"arn:aws:ssm:{REGION}::document/AWS-RunShellScript"
            ]
        },
        {
            "Sid": "SSMInvocationCheck",
            "Effect": "Allow",
            "Action": [
                "ssm:GetCommandInvocation"
            ],
            "Resource": f"arn:aws:ssm:{REGION}:{account_id}:*"
        },
        {
            "Sid": "SNSPublishAlerts",
            "Effect": "Allow",
            "Action": "sns:Publish",
            "Resource": sns_topic_arn
        },
        {
            "Sid": "CloudWatchLogging",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": f"arn:aws:logs:{REGION}:{account_id}:log-group:/aws/lambda/{FUNCTION_NAME}:*"
        },
        {
            "Sid": "EventBridgeInvokeLambda",
            "Effect": "Allow",
            "Action": "lambda:InvokeFunction",
            "Resource": f"arn:aws:lambda:{REGION}:{account_id}:function:{FUNCTION_NAME}"
        }
    ]
}

iam.put_role_policy(
    RoleName=ROLE_NAME,
    PolicyName="VITCarpoolSchedulerPolicy",
    PolicyDocument=json.dumps(scoped_policy)
)
role_arn = iam.get_role(RoleName=ROLE_NAME)['Role']['Arn']
print(f"   Role ARN: {role_arn}")

# Allow IAM propagation
time.sleep(10)

# 3. Create CloudWatch Log Group with 14-day retention
log_group_name = f"/aws/lambda/{FUNCTION_NAME}"
try:
    logs.create_log_group(logGroupName=log_group_name)
    print(f"3. Created log group {log_group_name}")
except logs.exceptions.ResourceAlreadyExistsException:
    print(f"3. Log group {log_group_name} already exists.")
logs.put_retention_policy(logGroupName=log_group_name, retentionInDays=14)

# 4. Package Lambda code
print("4. Packaging Lambda function...")
lambda_path = os.path.join(os.path.dirname(__file__), 'lambda_function.py')
if not os.path.exists(lambda_path):
    lambda_path = '/tmp/lambda_function.py'

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as z:
    with open(lambda_path, 'r') as f:
        z.writestr('lambda_function.py', f.read())
zip_bytes = zip_buffer.getvalue()

# 5. Create or Update Lambda Function
print("5. Deploying Lambda function...")
lambda_env = {
    'Variables': {
        'TARGET_REGION': REGION,
        'EC2_INSTANCE_ID': EC2_INSTANCE_ID,
        'RDS_INSTANCE_ID': RDS_INSTANCE_ID,
        'CLOUDFRONT_DIST_ID': CLOUDFRONT_DIST_ID,
        'SNS_TOPIC_ARN': sns_topic_arn
    }
}

try:
    fn_info = lambda_client.get_function(FunctionName=FUNCTION_NAME)
    print(f"   Updating existing function code for {FUNCTION_NAME}...")
    lambda_client.update_function_code(
        FunctionName=FUNCTION_NAME,
        ZipFile=zip_bytes
    )
    time.sleep(5)
    lambda_client.update_function_configuration(
        FunctionName=FUNCTION_NAME,
        Runtime='python3.12',
        Handler='lambda_function.lambda_handler',
        Role=role_arn,
        Timeout=900,
        MemorySize=128,
        Environment=lambda_env
    )
    lambda_arn = fn_info['Configuration']['FunctionArn']
except lambda_client.exceptions.ResourceNotFoundException:
    print(f"   Creating new function {FUNCTION_NAME}...")
    create_res = lambda_client.create_function(
        FunctionName=FUNCTION_NAME,
        Runtime='python3.12',
        Role=role_arn,
        Handler='lambda_function.lambda_handler',
        Code={'ZipFile': zip_bytes},
        Timeout=900,
        MemorySize=128,
        Environment=lambda_env,
        Description="Automated scheduler for VIT Carpool EC2, RDS, and CloudFront origin alignment"
    )
    lambda_arn = create_res['FunctionArn']

print(f"   Lambda Function ARN: {lambda_arn}")

# 6. Create EventBridge Schedules in Asia/Kolkata
print("6. Configuring EventBridge Schedules...")

# Schedule 1: Startup at 6:00 AM IST
startup_target = {
    'Arn': lambda_arn,
    'RoleArn': role_arn,
    'Input': json.dumps({'action': 'START'})
}

try:
    scheduler.get_schedule(Name=STARTUP_SCHEDULE_NAME)
    print(f"   Updating {STARTUP_SCHEDULE_NAME}...")
    scheduler.update_schedule(
        Name=STARTUP_SCHEDULE_NAME,
        ScheduleExpression="cron(0 6 * * ? *)",
        ScheduleExpressionTimezone="Asia/Kolkata",
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target=startup_target,
        State='ENABLED',
        Description="Daily morning startup for VIT Carpool (6:00 AM IST)"
    )
except scheduler.exceptions.ResourceNotFoundException:
    print(f"   Creating {STARTUP_SCHEDULE_NAME}...")
    scheduler.create_schedule(
        Name=STARTUP_SCHEDULE_NAME,
        ScheduleExpression="cron(0 6 * * ? *)",
        ScheduleExpressionTimezone="Asia/Kolkata",
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target=startup_target,
        State='ENABLED',
        Description="Daily morning startup for VIT Carpool (6:00 AM IST)"
    )

# Schedule 2: Shutdown at 12:00 AM (Midnight) IST
shutdown_target = {
    'Arn': lambda_arn,
    'RoleArn': role_arn,
    'Input': json.dumps({'action': 'STOP'})
}

try:
    scheduler.get_schedule(Name=SHUTDOWN_SCHEDULE_NAME)
    print(f"   Updating {SHUTDOWN_SCHEDULE_NAME}...")
    scheduler.update_schedule(
        Name=SHUTDOWN_SCHEDULE_NAME,
        ScheduleExpression="cron(0 0 * * ? *)",
        ScheduleExpressionTimezone="Asia/Kolkata",
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target=shutdown_target,
        State='ENABLED',
        Description="Daily overnight shutdown for VIT Carpool (12:00 AM Midnight IST)"
    )
except scheduler.exceptions.ResourceNotFoundException:
    print(f"   Creating {SHUTDOWN_SCHEDULE_NAME}...")
    scheduler.create_schedule(
        Name=SHUTDOWN_SCHEDULE_NAME,
        ScheduleExpression="cron(0 0 * * ? *)",
        ScheduleExpressionTimezone="Asia/Kolkata",
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target=shutdown_target,
        State='ENABLED',
        Description="Daily overnight shutdown for VIT Carpool (12:00 AM Midnight IST)"
    )

print("7. Deployment Completed Successfully!")

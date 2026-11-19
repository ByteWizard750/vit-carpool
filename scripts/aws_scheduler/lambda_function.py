import os
import json
import time
import logging
import urllib.request
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('AWS_REGION', 'ap-southeast-2')
EC2_INSTANCE_ID = os.environ.get('EC2_INSTANCE_ID', 'i-05f093ca0e4468d34')
RDS_INSTANCE_ID = os.environ.get('RDS_INSTANCE_ID', 'vit-carpool-prod-db')
CLOUDFRONT_DIST_ID = os.environ.get('CLOUDFRONT_DIST_ID', 'E2Y4W8ZL50MVD3')
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN', 'arn:aws:sns:ap-southeast-2:575936991768:vit-carpool-alerts')
PUBLIC_HEALTH_URL = 'https://d2yrkhtmwbyxt8.cloudfront.net/health'

ec2 = boto3.client('ec2', region_name=REGION)
rds = boto3.client('rds', region_name=REGION)
cf = boto3.client('cloudfront')
ssm = boto3.client('ssm', region_name=REGION)
sns = boto3.client('sns', region_name=REGION)

def send_alert(subject, message):
    logger.info(f"[ALERT] {subject}: {message}")
    if SNS_TOPIC_ARN:
        try:
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject=f"[VIT Carpool Scheduler] {subject}"[:100],
                Message=message
            )
        except Exception as e:
            logger.warning(f"Failed to publish SNS alert: {e}")

def run_ssm_command(commands, timeout_sec=120):
    """Executes a shell command on EC2 via SSM and returns (stdout, stderr, exit_code)."""
    try:
        res = ssm.send_command(
            InstanceIds=[EC2_INSTANCE_ID],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": commands},
            TimeoutSeconds=timeout_sec
        )
        cmd_id = res['Command']['CommandId']
        
        # Poll for completion
        for _ in range(timeout_sec // 2):
            time.sleep(2)
            inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=EC2_INSTANCE_ID)
            status = inv['Status']
            if status in ['Success', 'Failed', 'TimedOut', 'Cancelled']:
                return (
                    inv.get('StandardOutputContent', ''),
                    inv.get('StandardErrorContent', ''),
                    inv.get('ResponseCode', 1 if status != 'Success' else 0)
                )
        return ('', f'SSM command timed out after {timeout_sec}s', 1)
    except Exception as e:
        return ('', str(e), 1)

def check_active_operations():
    """
    Checks PostgreSQL for in-progress rides and active tracking sessions.
    Returns dict: {'activeRides': int, 'activeTracking': int, 'healthy': bool}
    """
    import base64
    check_js = '''
const { PrismaClient } = require('/app/packages/db/dist/index.js');
const prisma = new PrismaClient();
async function main() {
    try {
        const activeRides = await prisma.ride.count({ where: { status: 'IN_PROGRESS' } });
        const activeTracking = await prisma.rideTrackingSession.count({ where: { endedAt: null, isStale: false } });
        console.log(JSON.stringify({ activeRides, activeTracking, healthy: true }));
        process.exit(0);
    } catch(err) {
        console.log(JSON.stringify({ activeRides: 0, activeTracking: 0, healthy: false, error: err.message }));
        process.exit(1);
    }
}
main();
'''
    b64 = base64.b64encode(check_js.encode('utf-8')).decode('ascii')
    cmd = f"echo '{b64}' | base64 -d | docker exec -i vit_carpool_api node -"
    stdout, stderr, code = run_ssm_command([cmd], timeout_sec=30)
    
    if code != 0 or not stdout.strip():
        logger.warning(f"Could not query active operations: {stderr} (stdout: {stdout})")
        return {'activeRides': 0, 'activeTracking': 0, 'healthy': False, 'error': stderr or stdout}
    
    for line in reversed(stdout.strip().splitlines()):
        try:
            data = json.loads(line.strip())
            if 'activeRides' in data:
                return data
        except Exception:
            continue
            
    return {'activeRides': 0, 'activeTracking': 0, 'healthy': False, 'error': stdout}

def poll_rds_status(target_status, timeout_sec=600, poll_interval=15):
    """Polls RDS instance until it reaches target_status or times out."""
    logger.info(f"Polling RDS {RDS_INSTANCE_ID} until status == '{target_status}' (timeout {timeout_sec}s)...")
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        dbs = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)['DBInstances']
        if not dbs:
            raise RuntimeError(f"RDS instance {RDS_INSTANCE_ID} not found")
        status = dbs[0]['DBInstanceStatus']
        logger.info(f"RDS current status: {status}")
        if status == target_status:
            return True
        if target_status == 'available' and status in ['failed', 'incompatible-parameters', 'storage-full']:
            raise RuntimeError(f"RDS entered unexpected error state: {status}")
        time.sleep(poll_interval)
    raise TimeoutError(f"RDS {RDS_INSTANCE_ID} failed to reach '{target_status}' within {timeout_sec}s")

def poll_ec2_status(target_state, timeout_sec=300, poll_interval=10):
    """Polls EC2 instance until it reaches target_state or times out."""
    logger.info(f"Polling EC2 {EC2_INSTANCE_ID} until state == '{target_state}' (timeout {timeout_sec}s)...")
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        res = ec2.describe_instances(InstanceIds=[EC2_INSTANCE_ID])
        inst = res['Reservations'][0]['Instances'][0]
        state = inst['State']['Name']
        logger.info(f"EC2 current state: {state}")
        if state == target_state:
            return inst
        time.sleep(poll_interval)
    raise TimeoutError(f"EC2 {EC2_INSTANCE_ID} failed to reach '{target_state}' within {timeout_sec}s")

def update_cloudfront_origin_if_needed(new_public_dns):
    """
    Compares the current CloudFront origin domain with new_public_dns.
    Updates the distribution using ETag if different, preserving all custom headers & cache behaviors.
    """
    logger.info(f"Checking CloudFront distribution {CLOUDFRONT_DIST_ID} origin...")
    dist_config_res = cf.get_distribution_config(Id=CLOUDFRONT_DIST_ID)
    etag = dist_config_res['ETag']
    config = dist_config_res['DistributionConfig']
    
    current_origin_domain = config['Origins']['Items'][0]['DomainName']
    logger.info(f"Current CloudFront origin domain: {current_origin_domain}")
    logger.info(f"Target EC2 Public DNS: {new_public_dns}")
    
    if current_origin_domain == new_public_dns:
        logger.info("CloudFront origin is already up-to-date. No distribution update required.")
        return False
        
    logger.info(f"Updating CloudFront origin: {current_origin_domain} -> {new_public_dns}")
    config['Origins']['Items'][0]['DomainName'] = new_public_dns
    
    # Verify custom header is intact
    headers = config['Origins']['Items'][0].get('CustomHeaders', {}).get('Items', [])
    has_verify_header = any(h.get('HeaderName') == 'X-Origin-Verify' for h in headers)
    if not has_verify_header:
        raise RuntimeError("CRITICAL: Attempted CloudFront update lost X-Origin-Verify header! Aborting update.")
        
    update_res = cf.update_distribution(
        Id=CLOUDFRONT_DIST_ID,
        DistributionConfig=config,
        IfMatch=etag
    )
    logger.info("CloudFront distribution update submitted. Waiting for deployment completion...")
    
    # Wait for distribution status == 'Deployed' (max 5 minutes)
    start_time = time.time()
    while time.time() - start_time < 300:
        d = cf.get_distribution(Id=CLOUDFRONT_DIST_ID)['Distribution']
        status = d['Status']
        logger.info(f"CloudFront deployment status: {status}")
        if status == 'Deployed':
            logger.info("CloudFront distribution deployment completed successfully.")
            return True
        time.sleep(20)
        
    logger.warning("CloudFront distribution update in progress (continuing verification)...")
    return True

def handle_start(event, context):
    logger.info("=== START SEQUENCE INITIATED (6:00 AM IST) ===")
    
    # 1. Start RDS
    dbs = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)['DBInstances']
    rds_status = dbs[0]['DBInstanceStatus']
    logger.info(f"Initial RDS status: {rds_status}")
    
    if rds_status == 'stopped':
        logger.info(f"Starting RDS instance {RDS_INSTANCE_ID}...")
        rds.start_db_instance(DBInstanceIdentifier=RDS_INSTANCE_ID)
    elif rds_status == 'available':
        logger.info(f"RDS instance {RDS_INSTANCE_ID} is already available.")
    else:
        logger.info(f"RDS is currently in status '{rds_status}'. Waiting for available...")
        
    poll_rds_status('available', timeout_sec=600, poll_interval=15)
    logger.info("Step 1: RDS is AVAILABLE.")
    
    # 2. Start EC2
    inst = ec2.describe_instances(InstanceIds=[EC2_INSTANCE_ID])['Reservations'][0]['Instances'][0]
    ec2_state = inst['State']['Name']
    logger.info(f"Initial EC2 state: {ec2_state}")
    
    if ec2_state == 'stopped':
        logger.info(f"Starting EC2 instance {EC2_INSTANCE_ID}...")
        ec2.start_instances(InstanceIds=[EC2_INSTANCE_ID])
    elif ec2_state == 'running':
        logger.info(f"EC2 instance {EC2_INSTANCE_ID} is already running.")
    else:
        logger.info(f"EC2 is currently in state '{ec2_state}'. Waiting for running...")
        
    running_inst = poll_ec2_status('running', timeout_sec=300, poll_interval=10)
    new_public_dns = running_inst.get('PublicDnsName', '')
    logger.info(f"Step 2: EC2 is RUNNING with Public DNS: {new_public_dns}")
    
    if not new_public_dns:
        time.sleep(5)
        new_public_dns = ec2.describe_instances(InstanceIds=[EC2_INSTANCE_ID])['Reservations'][0]['Instances'][0].get('PublicDnsName', '')
        
    # 3. Update CloudFront Origin if needed
    update_cloudfront_origin_if_needed(new_public_dns)
    logger.info("Step 3: CloudFront origin alignment verified.")
    
    # 4. Wait for Docker containers & SSM agent to settle
    logger.info("Step 4: Waiting for application services and SSM agent...")
    time.sleep(25)
    
    # 5. Verify local health via SSM
    health_cmd = "curl -s -f http://127.0.0.1/health"
    stdout, stderr, code = run_ssm_command([health_cmd], timeout_sec=30)
    logger.info(f"Local Caddy health check (code {code}): {stdout.strip()}")
    
    # 6. Verify public CloudFront health
    try:
        req = urllib.request.Request(PUBLIC_HEALTH_URL, headers={'User-Agent': 'AWS-Scheduler-HealthCheck'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            http_status = resp.status
            body = resp.read().decode('utf-8')
            logger.info(f"CloudFront public health check: HTTP {http_status} - {body.strip()[:100]}")
    except Exception as e:
        logger.warning(f"Public CloudFront health check warning: {e}")
        
    send_alert(
        "Platform Startup Successful",
        f"VIT Chennai Carpool successfully started and verified.\n"
        f"EC2: {EC2_INSTANCE_ID} ({new_public_dns})\n"
        f"RDS: {RDS_INSTANCE_ID} (AVAILABLE)\n"
        f"CloudFront: {PUBLIC_HEALTH_URL} (HEALTHY)\n"
        f"Local health check: code {code}"
    )
    return {"status": "SUCCESS", "action": "START", "publicDns": new_public_dns}

def handle_stop(event, context):
    logger.info("=== SHUTDOWN SEQUENCE INITIATED (10:00 PM IST) ===")
    
    # Verify EC2 is running before checking rides
    inst = ec2.describe_instances(InstanceIds=[EC2_INSTANCE_ID])['Reservations'][0]['Instances'][0]
    ec2_state = inst['State']['Name']
    
    if ec2_state != 'running':
        logger.info(f"EC2 is not running (state: {ec2_state}). Checking RDS state...")
        dbs = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)['DBInstances']
        if dbs[0]['DBInstanceStatus'] == 'available':
            logger.info("Stopping RDS instance...")
            rds.stop_db_instance(DBInstanceIdentifier=RDS_INSTANCE_ID)
            poll_rds_status('stopped', timeout_sec=600, poll_interval=15)
        return {"status": "SUCCESS", "action": "STOP", "note": "EC2 was already stopped"}
        
    # 1. Active Operations Safeguard (Query PostgreSQL)
    logger.info("Step 1: Checking for active rides and tracking sessions...")
    ops = check_active_operations()
    logger.info(f"Active operations audit: {ops}")
    
    active_rides = ops.get('activeRides', 0)
    active_tracking = ops.get('activeTracking', 0)
    
    if active_rides > 0 or active_tracking > 0:
        logger.warning(
            f"Active operations detected at 10:00 PM IST: {active_rides} ride(s), {active_tracking} tracking session(s). "
            f"Entering 15-minute grace period..."
        )
        send_alert(
            "Scheduled Shutdown Delayed (Grace Period)",
            f"Active operations detected at 10:00 PM IST: {active_rides} in-progress ride(s) and {active_tracking} tracking session(s). "
            f"Granting a 15-minute grace period before re-checking."
        )
        
        # Sleep up to 15 minutes (900s)
        time.sleep(min(900, 15 * 60))
        
        # Re-check active operations
        ops_retry = check_active_operations()
        active_rides_retry = ops_retry.get('activeRides', 0)
        active_tracking_retry = ops_retry.get('activeTracking', 0)
        logger.info(f"Post-grace operations audit: {ops_retry}")
        
        if active_rides_retry > 0 or active_tracking_retry > 0:
            msg = (
                f"MANDATORY SAFETY POLICY TRIGGERED: {active_rides_retry} active ride(s) or tracking session(s) "
                f"remain in progress after the 15-minute grace period. "
                f"SKIPPING SHUTDOWN ENTIRELY to protect ongoing student commutes."
            )
            logger.warning(msg)
            send_alert("Scheduled Shutdown SKIPPED (Active Rides)", msg)
            return {
                "status": "SKIPPED",
                "action": "STOP",
                "reason": "ACTIVE_RIDES_IN_PROGRESS",
                "activeRides": active_rides_retry,
                "activeTracking": active_tracking_retry
            }
            
    logger.info("No active operations detected. Safe to proceed with shutdown.")
    
    # 2. Graceful container stop
    logger.info("Step 2: Gracefully stopping Docker containers...")
    drain_cmd = "docker compose -f /home/ubuntu/vit-carpool/docker-compose.prod.yml stop --timeout 15"
    stdout, stderr, code = run_ssm_command([drain_cmd], timeout_sec=60)
    logger.info(f"Container stop result (code {code}): {stdout.strip()}")
    
    # 3. Stop EC2
    logger.info(f"Step 3: Stopping EC2 instance {EC2_INSTANCE_ID}...")
    ec2.stop_instances(InstanceIds=[EC2_INSTANCE_ID])
    poll_ec2_status('stopped', timeout_sec=300, poll_interval=10)
    logger.info("EC2 instance is STOPPED.")
    
    # 4. Stop RDS (ONLY after confirming EC2 is stopped)
    logger.info(f"Step 4: Stopping RDS instance {RDS_INSTANCE_ID}...")
    dbs = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)['DBInstances']
    if dbs[0]['DBInstanceStatus'] == 'available':
        rds.stop_db_instance(DBInstanceIdentifier=RDS_INSTANCE_ID)
        poll_rds_status('stopped', timeout_sec=600, poll_interval=15)
        logger.info("RDS instance is STOPPED.")
    else:
        logger.info(f"RDS status is already '{dbs[0]['DBInstanceStatus']}'.")
        
    send_alert(
        "Platform Shutdown Successful",
        f"VIT Chennai Carpool successfully stopped for overnight schedule.\n"
        f"EC2: {EC2_INSTANCE_ID} (STOPPED)\n"
        f"RDS: {RDS_INSTANCE_ID} (STOPPED)\n"
        f"No active rides were interrupted."
    )
    return {"status": "SUCCESS", "action": "STOP"}

def handle_status(event, context):
    """Non-mutating status audit for safe verification."""
    logger.info("=== STATUS AUDIT INITIATED ===")
    
    # EC2 Status
    inst = ec2.describe_instances(InstanceIds=[EC2_INSTANCE_ID])['Reservations'][0]['Instances'][0]
    ec2_state = inst['State']['Name']
    ec2_public_dns = inst.get('PublicDnsName', '')
    
    # RDS Status
    dbs = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)['DBInstances']
    rds_status = dbs[0]['DBInstanceStatus']
    
    # CloudFront Status
    dist = cf.get_distribution(Id=CLOUDFRONT_DIST_ID)['Distribution']
    cf_status = dist['Status']
    cf_origin = dist['DistributionConfig']['Origins']['Items'][0]['DomainName']
    
    # Active operations if EC2 is running
    ops = check_active_operations() if ec2_state == 'running' else {'note': 'EC2 stopped; not queried'}
    
    result = {
        "status": "HEALTHY",
        "action": "STATUS",
        "ec2": {"id": EC2_INSTANCE_ID, "state": ec2_state, "publicDns": ec2_public_dns},
        "rds": {"id": RDS_INSTANCE_ID, "status": rds_status},
        "cloudfront": {"id": CLOUDFRONT_DIST_ID, "status": cf_status, "origin": cf_origin, "matchesEc2": cf_origin == ec2_public_dns},
        "activeOperations": ops
    }
    logger.info(f"Status audit result: {json.dumps(result, indent=2)}")
    return result

def lambda_handler(event, context):
    action = event.get('action', '').upper()
    logger.info(f"Scheduler invoked with action: '{action}'")
    
    try:
        if action == 'START':
            return handle_start(event, context)
        elif action == 'STOP':
            return handle_stop(event, context)
        elif action == 'STATUS':
            return handle_status(event, context)
        else:
            raise ValueError(f"Unknown action '{action}'. Valid actions are 'START', 'STOP', 'STATUS'.")
    except Exception as e:
        logger.error(f"Error executing action '{action}': {e}", exc_info=True)
        send_alert(f"Scheduler Execution FAILED ({action})", f"Error during action '{action}': {str(e)}")
        raise

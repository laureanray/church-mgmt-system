"""Generate the CloudFormation template, embedding the small Python Lambdas."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def ref(name):
    return {"Ref": name}


def sub(value):
    return {"Fn::Sub": value}


def attr(name, field):
    return {"Fn::GetAtt": [name, field]}


def policy(actions, resources):
    return {"Effect": "Allow", "Action": actions, "Resource": resources}


def role(service, statements, managed=None):
    properties = {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [{
            "Effect": "Allow", "Principal": {"Service": service}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "SharedCi", "PolicyDocument": {
            "Version": "2012-10-17", "Statement": statements}}],
    }
    if managed:
        properties["ManagedPolicyArns"] = managed
    return {"Type": "AWS::IAM::Role", "Properties": properties}


def build():
    table_resources = [attr("State", "Arn"), sub("${State.Arn}/index/*")]
    repository_map = sub('{"laureanray/tailsintub-v0":"${TailsSecretArn}","laureanray/church-mgmt-system":"${ChurchSecretArn}"}')
    resources = {
        "Artifacts": {"Type": "AWS::S3::Bucket", "Properties": {
            "PublicAccessBlockConfiguration": {"BlockPublicAcls": True, "BlockPublicPolicy": True,
                                               "IgnorePublicAcls": True, "RestrictPublicBuckets": True},
            "BucketEncryption": {"ServerSideEncryptionConfiguration": [{"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
        }},
        "State": {"Type": "AWS::DynamoDB::Table", "Properties": {
            "TableName": sub("${AWS::StackName}-state"), "BillingMode": "PAY_PER_REQUEST",
            "AttributeDefinitions": [{"AttributeName": "id", "AttributeType": "S"},
                                     {"AttributeName": "status", "AttributeType": "S"},
                                     {"AttributeName": "created_at", "AttributeType": "S"}],
            "KeySchema": [{"AttributeName": "id", "KeyType": "HASH"}],
            "GlobalSecondaryIndexes": [{"IndexName": "status-index", "KeySchema": [
                {"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "created_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"}}],
            "TimeToLiveSpecification": {"AttributeName": "expires_at", "Enabled": True},
            "SSESpecification": {"SSEEnabled": True},
        }},
        "WebhookSecret": {"Type": "AWS::SecretsManager::Secret", "Properties": {
            "Description": "HMAC key for the shared CI GitHub webhooks",
            "GenerateSecretString": {"PasswordLength": 64, "ExcludePunctuation": True},
        }},
        "SecurityGroup": {"Type": "AWS::EC2::SecurityGroup", "Properties": {
            "GroupDescription": "Shared CI: outbound only, administration through SSM",
            "VpcId": ref("VpcId"), "SecurityGroupIngress": [],
            "SecurityGroupEgress": [{"IpProtocol": "-1", "CidrIp": "0.0.0.0/0"}],
        }},
        "HostRole": role("ec2.amazonaws.com", [
            policy(["s3:ListBucket"], [attr("Artifacts", "Arn")]),
            policy(["s3:GetObject"], [sub("${Artifacts.Arn}/runtime/*")]),
            policy(["lambda:InvokeFunction"], [sub("arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-controller")]),
        ], [sub("arn:${AWS::Partition}:iam::aws:policy/AmazonSSMManagedInstanceCore")]),
        "HostProfile": {"Type": "AWS::IAM::InstanceProfile", "Properties": {"Roles": [ref("HostRole")]}},
        "Runner": {"Type": "AWS::EC2::Instance", "Properties": {
            "ImageId": ref("ImageId"), "InstanceType": "c6i.xlarge",
            "IamInstanceProfile": ref("HostProfile"), "EbsOptimized": True,
            "NetworkInterfaces": [{"DeviceIndex": "0", "SubnetId": ref("SubnetId"),
                                   "AssociatePublicIpAddress": True, "GroupSet": [ref("SecurityGroup")]}],
            "BlockDeviceMappings": [{"DeviceName": "/dev/xvda", "Ebs": {
                "VolumeSize": 100, "VolumeType": "gp3", "Encrypted": True, "DeleteOnTermination": True}}],
            "MetadataOptions": {"HttpTokens": "required", "HttpPutResponseHopLimit": 1},
            "Tags": [{"Key": "Name", "Value": sub("${AWS::StackName}-runner")},
                     {"Key": "ManagedBy", "Value": "shared-ci"}],
            "UserData": {"Fn::Base64": sub((ROOT / "user-data.sh").read_text())},
        }},
    }
    for name in ("Controller", "Webhook"):
        resources[name + "Logs"] = {"Type": "AWS::Logs::LogGroup", "Properties": {
            "LogGroupName": sub("/aws/lambda/${AWS::StackName}-" + name.lower()), "RetentionInDays": 7}}
    resources["ControllerRole"] = role("lambda.amazonaws.com", [
        policy(["logs:CreateLogStream", "logs:PutLogEvents"], [attr("ControllerLogs", "Arn")]),
        policy(["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"], table_resources),
        policy(["secretsmanager:GetSecretValue"], [ref("TailsSecretArn"), ref("ChurchSecretArn")]),
        policy(["ec2:DescribeInstances"], "*"),
        policy(["ec2:StartInstances", "ec2:StopInstances"], [sub("arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:instance/${Runner}")]),
    ])
    resources["WebhookRole"] = role("lambda.amazonaws.com", [
        policy(["logs:CreateLogStream", "logs:PutLogEvents"], [attr("WebhookLogs", "Arn")]),
        policy(["dynamodb:PutItem", "dynamodb:UpdateItem"], [attr("State", "Arn")]),
        policy(["secretsmanager:GetSecretValue"], [ref("WebhookSecret")]),
    ])
    for name, filename, env in [
        ("Controller", "controller.py", {"INSTANCE_ID": ref("Runner"), "ENABLED": ref("Enabled")}),
        ("Webhook", "webhook.py", {"WEBHOOK_SECRET_ARN": ref("WebhookSecret")}),
    ]:
        resources[name] = {"Type": "AWS::Lambda::Function", "Properties": {
            "FunctionName": sub("${AWS::StackName}-" + name.lower()), "Runtime": "python3.12",
            "Handler": "index.handler", "Role": attr(name + "Role", "Arn"),
            "Timeout": 55 if name == "Controller" else 15, "MemorySize": 256,
            "Environment": {"Variables": {"TABLE_NAME": ref("State"), "REPOSITORIES": repository_map, **env}},
            "Code": {"ZipFile": (ROOT / filename).read_text()},
        }}
    resources.update({
        "WebhookUrl": {"Type": "AWS::Lambda::Url", "Properties": {
            "TargetFunctionArn": attr("Webhook", "Arn"), "AuthType": "NONE"}},
        "WebhookUrlPermission": {"Type": "AWS::Lambda::Permission", "Properties": {
            "FunctionName": ref("Webhook"), "Action": "lambda:InvokeFunctionUrl",
            "Principal": "*", "FunctionUrlAuthType": "NONE"}},
        "WebhookInvokePermission": {"Type": "AWS::Lambda::Permission", "Properties": {
            "FunctionName": ref("Webhook"), "Action": "lambda:InvokeFunction",
            "Principal": "*", "InvokedViaFunctionUrl": True}},
        "Schedule": {"Type": "AWS::Events::Rule", "Properties": {
            "ScheduleExpression": "rate(1 minute)", "State": {"Fn::If": ["IsEnabled", "ENABLED", "DISABLED"]},
            "Targets": [{"Id": "controller", "Arn": attr("Controller", "Arn")}]}},
        "SchedulePermission": {"Type": "AWS::Lambda::Permission", "Properties": {
            "FunctionName": ref("Controller"), "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com", "SourceArn": attr("Schedule", "Arn")}},
    })
    return {"AWSTemplateFormatVersion": "2010-09-09",
        "Description": "One stop/start EC2 GitHub Actions host shared by Tails in Tub and church management",
        "Parameters": {
            "VpcId": {"Type": "AWS::EC2::VPC::Id"}, "SubnetId": {"Type": "AWS::EC2::Subnet::Id"},
            "ImageId": {"Type": "AWS::EC2::Image::Id"},
            "TailsSecretArn": {"Type": "String"}, "ChurchSecretArn": {"Type": "String"},
            "Enabled": {"Type": "String", "Default": "false", "AllowedValues": ["true", "false"]},
        }, "Conditions": {"IsEnabled": {"Fn::Equals": [ref("Enabled"), "true"]}},
        "Resources": resources,
        "Outputs": {
            "InstanceId": {"Value": ref("Runner")}, "ArtifactBucket": {"Value": ref("Artifacts")},
            "TableName": {"Value": ref("State")}, "ControllerFunction": {"Value": ref("Controller")},
            "WebhookUrl": {"Value": attr("WebhookUrl", "FunctionUrl")},
            "WebhookSecretArn": {"Value": ref("WebhookSecret")},
        },
    }


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))

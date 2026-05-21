"""Shared boto3 DynamoDB resource helper.

IRSA-based service identity is the only supported credential source; this
module never reads access keys from the environment.
"""

from __future__ import annotations

import boto3


def dynamo_resource(region_name: str = "eu-west-1"):
    """Return a boto3 DynamoDB resource bound to the given region."""
    return boto3.resource("dynamodb", region_name=region_name)

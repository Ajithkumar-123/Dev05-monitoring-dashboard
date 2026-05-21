#!/usr/bin/env bash
# Direct aws-cli changes made on 2026-05-13 (not via Terraform).
# These are bootstrap prerequisites — the Terraform stacks themselves
# couldn't run until these were in place.
#
# Run with --execute to actually run (default: print only).
#
# DO NOT re-run these without thought — the bucket creation is idempotent
# but the EKS CIDR update REPLACES the entire allowlist.

set -euo pipefail

EXECUTE="${1:-}"
DRY=$([[ "$EXECUTE" == "--execute" ]] && echo "" || echo "echo [dry-run]")

export AWS_PROFILE=${AWS_PROFILE:-opus2-dev}

# ─────────────────────────────────────────────────────────────────
# 1. EKS endpoint CIDR addition (~13:55 IST)
# Added 103.82.209.141/32 (operator's home IP) to enable kubectl from
# outside the office VPN. Cluster has 17 existing CIDRs that include
# office VPN egress IPs; this CIDR is a personal addition.
# REVERT TARGET: 17 original CIDRs (see revert.sh).
# ─────────────────────────────────────────────────────────────────
$DRY aws eks update-cluster-config \
  --name DEV05-EKS-CLUSTER \
  --region eu-west-1 \
  --resources-vpc-config "publicAccessCidrs=65.26.79.72/29,114.143.153.146/31,18.168.253.57/32,50.175.248.8/29,103.68.11.58/31,136.41.8.239/32,193.221.140.136/29,18.133.115.188/32,54.91.4.210/32,31.121.79.58/32,58.185.63.46/32,65.56.2.96/28,52.74.117.130/32,136.40.11.230/32,52.213.169.129/32,213.210.23.83/32,165.65.37.128/29,103.82.209.141/32"

# ─────────────────────────────────────────────────────────────────
# 2. Terraform state bucket bootstrap (~16:38 IST)
# Created before Phase A so the S3 backend works.
# Versioning + AES256 + BPA configured.
# ─────────────────────────────────────────────────────────────────
$DRY aws s3api create-bucket \
  --bucket docuploader-tfstate-537462380503 \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

$DRY aws s3api put-bucket-versioning \
  --bucket docuploader-tfstate-537462380503 \
  --versioning-configuration Status=Enabled

$DRY aws s3api put-bucket-encryption \
  --bucket docuploader-tfstate-537462380503 \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

$DRY aws s3api put-public-access-block \
  --bucket docuploader-tfstate-537462380503 \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

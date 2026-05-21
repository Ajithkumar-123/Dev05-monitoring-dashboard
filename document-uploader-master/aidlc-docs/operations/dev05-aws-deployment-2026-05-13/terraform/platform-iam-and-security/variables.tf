variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type    = string
  default = "sandbox"
}

variable "k8s_namespace" {
  type        = string
  description = "K8s namespace where all docuploader workloads run"
  default     = "docuploader"
}

variable "aspose_namespace" {
  type        = string
  description = "K8s namespace where the Aspose container Pod runs (separate per design)"
  default     = "aspose-converter"
}

variable "eks_cluster_name" {
  type        = string
  description = "Sandbox-managed EKS cluster name; used to look up the OIDC provider"
  default     = "sandbox-eks"
}

variable "platform_data_remote_state_key" {
  type        = string
  description = "Key for the platform-data Terraform state in S3"
  default     = "platform-data/terraform.tfstate"
}

variable "tfstate_bucket" {
  type        = string
  default     = "docuploader-tfstate"
}

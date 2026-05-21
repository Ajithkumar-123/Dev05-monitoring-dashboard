variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type    = string
  default = "sandbox"
}

variable "tfstate_bucket" {
  type    = string
  default = "docuploader-tfstate"
}

variable "platform_data_remote_state_key" {
  type    = string
  default = "platform-data/terraform.tfstate"
}

variable "platform_iam_remote_state_key" {
  type    = string
  default = "platform-iam-and-security/terraform.tfstate"
}

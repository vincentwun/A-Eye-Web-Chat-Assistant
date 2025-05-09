variable "project_id" {
  description = "The GCP Project ID"
  type        = string
  default     = "aeye-459303"
}

variable "region" {
  description = "The GCP region for deployment"
  type        = string
  default     = "us-central1"
}

variable "function_name" {
  description = "The name of the Cloud Function"
  type        = string
  default     = "gemini-proxy"
}

variable "node_runtime" {
  description = "The Node.js runtime for the function"
  type        = string
  default     = "nodejs20"
}

variable "function_entry_point" {
  description = "The entry point function in your Node.js code"
  type        = string
  default     = "geminiProxyFunction"
}

variable "function_memory" {
  description = "Memory allocated to the function"
  type        = string
  default     = "256Mi"
}

variable "function_max_instances" {
  description = "Maximum number of function instances"
  type        = number
  default     = 1
}

variable "api_id" {
  description = "The ID for the API Gateway API"
  type        = string
  default     = "gemini-api-id"
}

variable "api_config_id_prefix" {
  description = "The prefix for the API Gateway API Config ID (GCP adds suffix)"
  type        = string
  default     = "gemini-config-id"
}

variable "gateway_id" {
  description = "The ID for the API Gateway instance"
  type        = string
  default     = "gemini-gateway-id"
}

variable "source_code_directory" {
  description = "Path to the directory containing function source code"
  type        = string
  default     = "./function_source"
}

variable "function_bucket_name" {
  description = "Must be globally unique. If empty, a name is generated."
  type        = string
  default     = ""
}

variable "function_timeout_seconds" {
  description = "Timeout for the Cloud Function in seconds"
  type        = number
  default     = 60
}

variable "api_key_name" {
  description = "Display name for the API Key in GCP Console"
  type        = string
  default     = "gemini-gateway-key"
}
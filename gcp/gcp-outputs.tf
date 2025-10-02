# API Managed Service Name
output "api_managed_service_name" {
  description = "The Managed Service name created/used by API Gateway for this API"
  value       = google_api_gateway_api.api.managed_service
}

# API Gateway Endpoint
output "api_gateway_proxy_endpoint" {
  description = "The full endpoint URL for the API Gateway proxy"
  value       = "https://${google_api_gateway_gateway.gateway.default_hostname}/gemini-proxy"
  depends_on  = [google_api_gateway_gateway.gateway]
}

# API Key
output "api_key_string" {
  description = "The created API Key string"
  value       = google_apikeys_key.gateway_key.key_string
  sensitive   = true
}
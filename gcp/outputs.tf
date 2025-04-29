output "api_gateway_proxy_endpoint" {
  description = "The full endpoint URL for the API Gateway proxy"
  value       = "https://${google_api_gateway_gateway.gateway.default_hostname}/gemini-proxy"
  depends_on = [google_api_gateway_gateway.gateway]
}

output "api_key_string" {
  description = "The created API Key string"
  value       = google_api_key.gateway_key.key_string
  sensitive   = true
}
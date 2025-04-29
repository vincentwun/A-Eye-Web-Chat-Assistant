# --- API Key Creation ---
resource "google_api_key" "gateway_key" {
  provider = google-beta 

  project      = var.project_id
  name         = var.api_key_name 
  display_name = var.api_key_name 

  restrictions {
    api_targets {
      service = google_api_gateway_api.api.managed_service
    }
  }

  depends_on = [
    google_project_service.apikeys,
    google_api_gateway_api.api 
  ]
}
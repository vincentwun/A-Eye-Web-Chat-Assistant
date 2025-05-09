# --- API Key Creation ---
resource "google_apikeys_key" "gateway_key" {

  project      = var.project_id
  name         = var.api_key_name
  display_name = var.api_key_name

  depends_on = [
    google_project_service.apikeys,
    google_api_gateway_api.api
  ]
}

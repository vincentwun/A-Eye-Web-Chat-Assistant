# Creates the API Gateway API container and allocates a consumer managed service
resource "google_api_gateway_api" "api" {
  provider   = google-beta
  project    = var.project_id
  api_id     = var.api_id
  depends_on = [google_project_service.apigateway]
}

# Creates an immutable API Config from the rendered OpenAPI (use templatefile to inject function_url)
resource "google_api_gateway_api_config" "api_config" {
  provider             = google-beta
  project              = var.project_id
  api                  = google_api_gateway_api.api.api_id
  api_config_id_prefix = var.api_config_id_prefix

  openapi_documents {
    document {
      path = "openapi_spec.yaml"
      contents = base64encode(
        templatefile("${path.module}/api-config.yaml.tftpl", {
          function_url = google_cloudfunctions2_function.gemini_proxy.service_config[0].uri
        })
      )
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    google_project_service.apigateway,
    google_project_service.servicecontrol,
    google_project_service.servicemanagement,
    google_cloudfunctions2_function.gemini_proxy
  ]
}

# Explicitly enables the consumer managed service associated with this API
resource "google_project_service" "apigw_managed" {
  project            = var.project_id
  service            = google_api_gateway_api.api.managed_service
  disable_on_destroy = false
  depends_on         = [google_api_gateway_api_config.api_config]
}

# Deploys the regional API Gateway instance bound to the above API Config
resource "google_api_gateway_gateway" "gateway" {
  provider   = google-beta
  project    = var.project_id
  region     = var.region
  gateway_id = var.gateway_id
  api_config = google_api_gateway_api_config.api_config.id

  depends_on = [
    google_project_service.apigateway,
    google_api_gateway_api_config.api_config,
    google_project_service.apigw_managed
  ]
}

# Creates an API key restricted to this API's managed service
resource "google_apikeys_key" "gateway_key" {
  project      = var.project_id
  name         = var.api_key_name
  display_name = var.api_key_name

  restrictions {
    api_targets {
      service = google_project_service.apigw_managed.service
      methods = ["*"]
    }
  }

  depends_on = [
    google_project_service.apikeys,
    google_api_gateway_api.api,
    google_project_service.apigw_managed
  ]
}

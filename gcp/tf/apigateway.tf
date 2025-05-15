# --- API Gateway ---
resource "google_api_gateway_api" "api" {
  provider = google-beta
  project = var.project_id
  api_id  = var.api_id

  depends_on = [google_project_service.apigateway]
}

data "template_file" "api_config_rendered" {
  template = file(pathexpand("api-config.yaml.tftpl"))

  vars = {
    function_url = google_cloudfunctions2_function.gemini_proxy.service_config[0].uri
  }

  depends_on = [google_cloudfunctions2_function.gemini_proxy]
}

resource "google_api_gateway_api_config" "api_config" {
  provider   = google-beta
  project    = var.project_id
  api        = google_api_gateway_api.api.api_id
  api_config_id_prefix = var.api_config_id_prefix

  openapi_documents {
    document {
      path     = "openapi_spec.yaml"
      contents = base64encode(data.template_file.api_config_rendered.rendered)
    }
  }
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    google_project_service.apigateway,
    google_project_service.servicecontrol,
    google_project_service.servicemanagement,
    data.template_file.api_config_rendered
  ]
}

resource "google_api_gateway_gateway" "gateway" {
  provider   = google-beta
  project    = var.project_id
  region   = var.region
  gateway_id = var.gateway_id
  api_config = google_api_gateway_api_config.api_config.id

  depends_on = [
    google_project_service.apigateway,
    google_api_gateway_api_config.api_config,
    google_project_iam_member.apigw_sa_serviceusage_admin
  ]
}
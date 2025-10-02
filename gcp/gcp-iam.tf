# Function Service Account (SA): execution identity for Cloud Functions Gen2
resource "google_service_account" "fn_sa" {
  account_id   = "gemini-proxy-fn-sa"
  display_name = "Gemini Proxy Function SA"
  depends_on   = [google_project_service.iam]
}

# Vertex AI minimal access for Function SA: allow invoke Vertex AI (roles/aiplatform.user)
resource "google_project_iam_member" "fn_sa_vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.fn_sa.email}"

  depends_on = [
    google_project_service.aiplatform,
    google_service_account.fn_sa
  ]
}

# Grant API Gateway Service Agent resource-level Run Invoker on the CF Gen2 underlying Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "fn_allow_apigw" {
  project  = var.project_id
  location = var.region
  name     = google_cloudfunctions2_function.gemini_proxy.service_config[0].service
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.run,
    google_project_service.apigateway,
    google_cloudfunctions2_function.gemini_proxy
  ]
}

# API Gateway Service Agent: consumer role for service usage checks and accounting
resource "google_project_iam_member" "apigw_sa_serviceusage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.apigateway,
    google_project_service.serviceusage
  ]
}
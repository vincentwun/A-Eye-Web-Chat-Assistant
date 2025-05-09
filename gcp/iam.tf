# --- IAM Permissions ---

# Compute Engine SA: permission to call Vertex AI
resource "google_project_iam_member" "compute_sa_vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.aiplatform, google_project_service.iam]
}

# Compute Engine SA: the Editor role
resource "google_project_iam_member" "compute_sa_editor" {
  project = var.project_id
  role    = "roles/editor"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.iam]
}

# Compute Engine SA: the Project IAM Admin role
resource "google_project_iam_member" "compute_sa_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.iam]
}

# API Gateway SA: Permission to invoke the Cloud Function
resource "google_project_iam_member" "apigw_sa_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.apigateway,
    google_project_service.run,
    google_project_service.iam,
    google_cloudfunctions2_function.gemini_proxy,
    time_sleep.wait_for_api_gateway_sa
  ]
}

# API Gateway SA: Permission for service usage checks
resource "google_project_iam_member" "apigw_sa_serviceusage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.apigateway,
    google_project_service.serviceusage,
    google_project_service.iam,
    time_sleep.wait_for_api_gateway_sa
  ]
}

# API Gateway SA: Permission to enable the managed service it creates
resource "google_project_iam_member" "apigw_sa_serviceusage_admin" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageAdmin"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.apigateway,
    google_project_service.serviceusage,
    google_project_service.iam,
    time_sleep.wait_for_api_gateway_sa
  ]
}
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}


data "google_project" "project" {
  project_id = var.project_id
}

# --- Enable APIs ---
resource "google_project_service" "apigateway" {
  project = var.project_id
  service = "apigateway.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  project = var.project_id
  service = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  project = var.project_id
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "aiplatform" {
  project = var.project_id
  service = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "serviceusage" {
  project = var.project_id
  service = "serviceusage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  project = var.project_id
  service = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project = var.project_id
  service = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "servicemanagement" {
  project = var.project_id
  service = "servicemanagement.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "servicecontrol" {
  project = var.project_id
  service = "servicecontrol.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  project = var.project_id
  service = "apikeys.googleapis.com"
  disable_on_destroy = false
}

# --- IAM Permissions ---

# Grant default Compute Engine SA (used by Gen 2 Function by default) permission to call Vertex AI
resource "google_project_iam_member" "compute_sa_vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.aiplatform, google_project_service.iam]
}

# Grant API Gateway Service Agent permission to invoke the Cloud Function
resource "google_project_iam_member" "apigw_sa_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [
    google_project_service.apigateway,
    google_project_service.run,
    google_project_service.iam,
    google_cloudfunctions2_function.gemini_proxy
  ]
}

# Grant API Gateway Service Agent permission for service usage checks
resource "google_project_iam_member" "apigw_sa_serviceusage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [google_project_service.apigateway, google_project_service.serviceusage, google_project_service.iam]
}
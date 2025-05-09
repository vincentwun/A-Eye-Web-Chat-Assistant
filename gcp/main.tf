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
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project = var.project_id
  region  = var.region

  user_project_override = true
  billing_project       = var.project_id
}


data "google_project" "project" {
  project_id = var.project_id
}

# --- Enable APIs ---
resource "google_project_service" "apigateway" {
  project            = var.project_id
  service            = "apigateway.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  project            = var.project_id
  service            = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  project            = var.project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "aiplatform" {
  project            = var.project_id
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "serviceusage" {
  project            = var.project_id
  service            = "serviceusage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  project            = var.project_id
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project            = var.project_id
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "servicemanagement" {
  project            = var.project_id
  service            = "servicemanagement.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "servicecontrol" {
  project            = var.project_id
  service            = "servicecontrol.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  project            = var.project_id
  service            = "apikeys.googleapis.com"
  disable_on_destroy = false
}

# Trigger creation of the API Gateway service account and wait
resource "null_resource" "trigger_api_gateway_sa_creation" {
  triggers = {
    api_enabled = google_project_service.apigateway.id
  }

  provisioner "local-exec" {
    command = "gcloud beta services identity create --service=apigateway.googleapis.com --project=${var.project_id}"
  }

  depends_on = [
    google_project_service.apigateway
  ]
}

# Wait 30 seconds after triggering API Gateway SA creation
resource "time_sleep" "wait_for_api_gateway_sa" {
  create_duration = "30s"
  depends_on = [null_resource.trigger_api_gateway_sa_creation]
}
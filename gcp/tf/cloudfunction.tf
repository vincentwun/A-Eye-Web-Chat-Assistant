# --- Cloud Function Source Code Packaging ---
data "archive_file" "function_source_zip" {
  type        = "zip"
  source_dir  = var.source_code_directory
  output_path = "/tmp/${var.function_name}-source.zip"
}

resource "google_storage_bucket" "function_bucket" {
  name                        = var.function_bucket_name != "" ? var.function_bucket_name : "${var.project_id}-${var.function_name}-src"
  location                    = var.region
  uniform_bucket_level_access = true
  project                     = var.project_id

  depends_on = [
    google_project_service.cloudfunctions,
    google_project_service.cloudbuild,
  ]
}

resource "google_storage_bucket_object" "function_source_object" {
  name   = "${var.function_name}-source-${data.archive_file.function_source_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.function_source_zip.output_path
}

# --- Cloud Function (Gen 2) ---
resource "google_cloudfunctions2_function" "gemini_proxy" {
  name        = var.function_name
  location    = var.region
  project     = var.project_id

  build_config {
    runtime     = var.node_runtime
    entry_point = var.function_entry_point
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.function_source_object.name
      }
    }
  }

  service_config {
    max_instance_count = var.function_max_instances
    available_memory   = var.function_memory
    timeout_seconds    = var.function_timeout_seconds
    ingress_settings   = "ALLOW_ALL"
    all_traffic_on_latest_revision = true
  }

  depends_on = [
    google_project_service.cloudfunctions,
    google_project_service.run,
    google_project_service.cloudbuild,
    google_project_service.aiplatform,
    google_project_service.iam,
    google_storage_bucket_object.function_source_object
  ]
}
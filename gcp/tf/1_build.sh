#!/bin/bash

# Replace <Your Project ID> with your actual GCP project ID
PROJECT_ID=<Your Project ID>

export TF_VAR_project_id=$PROJECT_ID

gcloud config set project $PROJECT_ID

gcloud auth application-default set-quota-project $PROJECT_ID

gcloud services enable cloudresourcemanager.googleapis.com --project=$PROJECT_ID

# Terraform build infra
terraform init
terraform plan -var="project_id=${PROJECT_ID}"
terraform apply -auto-approve -var="project_id=${PROJECT_ID}"

# Get the API key
terraform output api_key_string

gcloud services enable gemini-api-id-1diqs680eq9np.apigateway.tf-20250504b.cloud.goog --project=$PROJECT_ID
# Create, link, config and enable services for the project
gcloud projects create $PROJECT_ID --name=$PROJECT_ID --set-as-default
gcloud beta billing projects link $PROJECT_ID --billing-account=$Billing_Account_ID
gcloud config set project $PROJECT_ID
gcloud auth application-default set-quota-project $PROJECT_ID
gcloud services enable cloudresourcemanager.googleapis.com --project=$PROJECT_ID

# Use Terraform to build infrastructure
terraform init
terraform plan -var="project_id=${PROJECT_ID}"
terraform apply -auto-approve -var="project_id=${PROJECT_ID}"

# Get the API key
terraform output api_key_string
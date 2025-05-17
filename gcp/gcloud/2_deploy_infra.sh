#!/bin/bash
echo "Starting: Deploy Infrastructure & Get Function URL"

# Create a new GCP project
echo "Creating project ${PROJECT_ID}..."
gcloud projects create ${PROJECT_ID} \
  --name="Gemini Proxy" \
  --set-as-default || { echo "Failed to create project. Exiting."; exit 1; }

# Link the project to a billing account
echo "Linking billing account ${BILLING_ACCOUNT_ID}..."
gcloud beta billing projects link ${PROJECT_ID} \
  --billing-account=${BILLING_ACCOUNT_ID} || { echo "Failed to link billing account. Exiting."; exit 1; }

# Enable the required APIs
echo "Enabling core APIs (this might take a few minutes)..."
gcloud services enable \
    apigateway.googleapis.com \
    cloudfunctions.googleapis.com \
    run.googleapis.com \
    aiplatform.googleapis.com \
    serviceusage.googleapis.com \
    cloudbuild.googleapis.com \
    iam.googleapis.com \
    servicemanagement.googleapis.com \
    servicecontrol.googleapis.com \
    apikeys.googleapis.com \
    --project=${PROJECT_ID} || { echo "Failed to enable core APIs. Exiting."; exit 1; }

echo "Core APIs enabled. Waiting 30 seconds for propagation..."
sleep 30

# Grant default Compute Engine Service Account permission to call Vertex AI
echo "Granting Vertex AI permissions..."
PROJECT_NUMBER_VAL=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
DEFAULT_COMPUTE_SA_VAL="${PROJECT_NUMBER_VAL}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${DEFAULT_COMPUTE_SA_VAL}" \
  --role="roles/aiplatform.user" || { echo "Failed to grant Vertex AI permissions. Exiting."; exit 1; }

# Create Cloud function
echo "Deploying Cloud Function ${FUNCTION_NAME} (this might take several minutes)..."
if [ ! -f "index.js" ] || [ ! -f "package.json" ]; then
    echo "Error: index.js or package.json not found in current directory. Exiting."
    exit 1
fi
gcloud functions deploy ${FUNCTION_NAME} \
  --gen2 \
  --region=${REGION} \
  --runtime=${NODE_RUNTIME} \
  --project=${PROJECT_ID} \
  --source=. \
  --entry-point=geminiProxyFunction \
  --trigger-http \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=256Mi || { echo "Failed to deploy Cloud Function. Exiting."; exit 1; }

# Create the API Gateway API
echo "Creating API Gateway API definition ${API_ID}..."
gcloud api-gateway apis create ${API_ID} --project=${PROJECT_ID} || { echo "Failed to create API Gateway API definition. Exiting."; exit 1; }

echo ""
echo "---------------------------------------------------------------------"
echo "ACTION REQUIRED: Cloud Function Deployed!"
echo "Your Function Invoke URL is:"
FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --gen2 \
  --format='value(serviceConfig.uri)')
echo "${FUNCTION_URL}"
echo "COPY this URL and UPDATE it in 'api-config.yaml' (around line 18)."
echo "Save 'api-config.yaml' before running the next script (3_create_gateway_and_key.sh)."
echo "---------------------------------------------------------------------"
echo "Script 2_deploy_infra.sh finished."
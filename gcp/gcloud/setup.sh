# Setup env
export FUNCTION_NAME="gemini-proxy-function"
export REGION="us-central1"
export PROJECT_ID="api-gateway-20250429"
export NODE_RUNTIME="nodejs20"
export API_ID="gemini-proxy-api"
export API_CONFIG_ID="gemini-proxy-config-v1"
export GATEWAY_ID="gemini-proxy-gateway"

# Enable the required APIs
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
    --project=$PROJECT_ID

# Grant default Compute Engine Service Account permission to call Vertex AI
export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
export DEFAULT_COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${DEFAULT_COMPUTE_SA}" \
  --role="roles/aiplatform.user"

# Create Cloud function (using index.js, package.json)
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
  --memory=256Mi

# Get Function Invoke URL
gcloud functions describe ${FUNCTION_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --gen2 \
  --format='value(serviceConfig.uri)'

# Create the API Gateway API
gcloud api-gateway apis create ${API_ID} --project=$PROJECT_ID

# Create the API config (api-config.yaml)
gcloud api-gateway api-configs create ${API_CONFIG_ID} \
  --api=${API_ID} \
  --project=${PROJECT_ID} \
  --openapi-spec=api-config.yaml

# Grant API Gateway Service Agent necessary permissions
export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
export APIGW_SA_EMAIL="service-${PROJECT_NUMBER}@gcp-sa-apigateway.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APIGW_SA_EMAIL}" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APIGW_SA_EMAIL}" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Create the API Gateway
gcloud api-gateway gateways create ${GATEWAY_ID} \
  --api=${API_ID} \
  --api-config=${API_CONFIG_ID} \
  --location=${REGION}  \
  --project=${PROJECT_ID}


# Get the API Gateway URL
gcloud api-gateway gateways describe ${GATEWAY_ID} \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --format='value(defaultHostname)'
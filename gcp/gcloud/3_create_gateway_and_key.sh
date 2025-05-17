#!/bin/bash
echo "Starting: Create Gateway & API Key"

if [ ! -f "api-config.yaml" ]; then
    echo "Error: api-config.yaml not found. Exiting."
    exit 1
fi
if grep -q "YOUR_FUNCTION_TRIGGER_URL_WILL_GO_HERE" api-config.yaml || grep -q "your-function-name-blahblah-uc.a.run.app" api-config.yaml ; then # Add common placeholders
    echo "Error: 'api-config.yaml' appears to still contain a placeholder Function URL."
    echo "Please ensure you have updated it with the actual URL from the previous step. Exiting."
    exit 1
fi

# Create the API config
echo "Creating API Gateway Config ${API_CONFIG_ID}..."
gcloud api-gateway api-configs create ${API_CONFIG_ID} \
  --api=${API_ID} \
  --project=${PROJECT_ID} \
  --openapi-spec=api-config.yaml || { echo "Failed to create API Config. Exiting."; exit 1; }

# Grant API Gateway Service Agent necessary permissions
echo "Granting permissions to API Gateway Service Agent..."
PROJECT_NUMBER_VAL=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
APIGW_SA_EMAIL_VAL="service-${PROJECT_NUMBER_VAL}@gcp-sa-apigateway.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APIGW_SA_EMAIL_VAL}" \
  --role="roles/run.invoker" || { echo "Failed to grant run.invoker to APIGW SA. Exiting."; exit 1; }

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APIGW_SA_EMAIL_VAL}" \
  --role="roles/serviceusage.serviceUsageConsumer" || { echo "Failed to grant serviceUsageConsumer to APIGW SA. Exiting."; exit 1; }

# Create the API Gateway
echo "Creating API Gateway ${GATEWAY_ID} (this might take several minutes)..."
gcloud api-gateway gateways create ${GATEWAY_ID} \
  --api=${API_ID} \
  --api-config=${API_CONFIG_ID} \
  --location=${REGION}  \
  --project=${PROJECT_ID} || { echo "Failed to create API Gateway. Exiting."; exit 1; }

echo "API Gateway creation initiated. Waiting 90 seconds for deployment..."
sleep 90 # Crucial delay for gateway deployment

# Get the API Gateway URL
echo ""
echo "---------------------------------------------------------------------"
echo "API Gateway Endpoint URL (add your API path, e.g., /gemini-proxy):"
GATEWAY_HOSTNAME=$(gcloud api-gateway gateways describe ${GATEWAY_ID} --location=${REGION} --project=${PROJECT_ID} --format='value(defaultHostname)')
if [ -z "${GATEWAY_HOSTNAME}" ]; then
    echo "ERROR: Could not retrieve Gateway hostname."
    API_GATEWAY_URL="FAILED_TO_RETRIEVE_URL"
else
    API_GATEWAY_URL="https://${GATEWAY_HOSTNAME}/gemini-proxy" # Assuming /gemini-proxy from your config
    echo "${API_GATEWAY_URL}"
fi
echo "---------------------------------------------------------------------"

# Create an API key
echo ""
echo "Creating API Key..."
API_KEY_STRING=$(gcloud alpha services api-keys create \
  --project=${PROJECT_ID} \
  --display-name="Gemini_Proxy_API_Key" \
  --format="json" | jq -r '.keyString')

if [ -z "${API_KEY_STRING}" ]; then
    echo "ERROR: Failed to create or retrieve API Key String."
else
    echo "---------------------------------------------------------------------"
    echo "API Key String (for x-api-key header):"
    echo "${API_KEY_STRING}"
    echo "---------------------------------------------------------------------"
fi
echo "Script 3_create_gateway_and_key.sh finished."
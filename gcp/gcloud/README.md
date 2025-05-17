## Prerequisites

1.  **Install Google Cloud SDK (gcloud CLI)**: https://cloud.google.com/sdk/docs/install#deb
2.  **Login to gcloud**: gcloud auth application-default login

## Deployment Steps

### 1. Go to gcloud dir
```
cd gcp/gcloud
```

### 2. Configure & Source Environment Variables

a.  Edit `1_setup_env.sh`:
    *   **Update `BILLING_ACCOUNT_ID`** with your actual Google Cloud Billing Account ID.
b.  Source the script to load variables:
    ```bash
    source ./1_setup_env.sh
    ```

### 3. Deploy Infrastructure & Get Function URL
a.  Run the script:
    ```bash
    ./2_deploy_infra.sh
    ```
b.  **ACTION REQUIRED**:
    *   The script will output a **Function Invoke URL**.
    *   **Copy this URL.**
    *   Open `api-config.yaml`.
    *   Replace the placeholder in `address:` (line 18) with the copied Function URL.
    *   Save `api-config.yaml`.


### 4. Create Gateway & API Key

This script finalizes the API Gateway setup and generates your API key.

a.  Run the script:
    ```bash
    ./3_create_gateway_and_key.sh
    ```
b.  The script will output:
    *   **API Gateway Endpoint URL** (e.g., `https://your-gateway-id.uc.gateway.dev/gemini-proxy`)
    *   **API Key String**

### 5. Use in Chrome Extension

*   **Endpoint**: Entry to **Setting** > **API Gateway Endpoint**
*   **API Key**: Entry to **Setting** > **Gemini API Key** 
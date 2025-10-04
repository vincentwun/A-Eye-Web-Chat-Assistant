# A-Eye Web Chat Assistant Cloud Infra

You can quickly deploy serverless backends, API Gateway, Cloud Functions, and Vertex AI integration using Google Cloud Platform (GCP).

[Read In Chinese](./README.zh.md)

---

## Prerequisites

For the safest and latest installation, please refer to the official guides for CLI tools:

- [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install)
- [Terraform](https://developer.hashicorp.com/terraform/install#linux)

---

### GCP Terraform Deployment Guide

1. Install required tools

```bash
./install.sh
```

2. Login to Google Cloud:

```bash
gcloud auth login --update-adc
```

3. Set up billing account:

```bash
gcloud beta billing accounts list
Billing_Account_ID=<Your Billing Account ID>
```

4. Set up Project ID:

```bash
PROJECT_ID=a-eye-infra
export TF_VAR_project_id=$PROJECT_ID
```

5. Run build.sh

```bash
./build.sh
```

6. Copy the output of `api_gateway_proxy_endpoint`and `api_key_string`

7. Config the copied info to chrome extension's `Setting` > `Cloud AI Settings` > `Vertex AI` > `API Gateway Endpoint` & `GCP API Key`

Note: It may take 5 minutes for settings to take effect.

---

### Delete GCP Infrastructure

1. Delete GCP infra:

```bash
terraform destroy -auto-approve
```

2. Delete GCP Project:

```bash
gcloud projects delete $PROJECT_ID
```
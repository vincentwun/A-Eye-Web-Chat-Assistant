# A-Eye Web Chat Assistant Cloud Infra

你可用 Google Cloud Platform (GCP) 快速部署 Serverless 後端, API Gateway、Cloud Functions 及Vertex AI。

[Read In English](./README.md)

---

## 安裝前置需求

請參考官方教學安裝並登入所需 CLI 工具（以取得最新且安全的安裝方式）：

- [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install?hl=zh-tw)
- [Terraform](https://developer.hashicorp.com/terraform/install#linux)

---

### GCP Terraform 部署指南

1. 進入 Terraform 目錄：

```bash
cd gcp
chmod +x ./*.sh
```

2. 登入 Google Cloud：

```bash
gcloud auth login --update-adc
```

3. 設定專案 ID：

```bash
PROJECT_ID=a-eye-infra
export TF_VAR_project_id=$PROJECT_ID
```

4. 設定帳單帳戶：

```bash
gcloud beta billing accounts list
Billing_Account_ID=<您的帳單帳戶 ID>
```

5. 執行 build.sh：

```bash
./build.sh
```

6. 複製 `api_gateway_proxy_endpoint` 和 `api_key_string` 的輸出。

7. 將複製的資訊設定到 Chrome 擴充功能的「設定」>「Cloud AI Settings」>「Vertex AI」>「API Gateway Endpoint」和「GCP API Key」。

注意：設定可能需要 5 分鐘才能生效。

---

### 刪除 GCP 架構

1. 刪除 GCP 基礎架構：

```bash
terraform destroy -auto-approve
```

2. 刪除 GCP 專案:

```bash
gcloud projects delete $PROJECT_ID
```
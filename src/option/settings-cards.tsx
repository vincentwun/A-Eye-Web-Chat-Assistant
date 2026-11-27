import { Fragment } from "react";
import {
  availableLanguages,
  availableResponseLanguages,
} from "./languagesSettings";
import { languageOptions } from "./languageOptions";
import { cloudVisibility, localVisibility } from "./serviceVisibility";
import { fieldValue, useOptions } from "./optionsContext";
import { ollamaModels, lmstudioModels } from "./modelChoices";

type ServiceOption = { id: string; value: string; label: string };
const geminiModels = [
  "gemini-2.5-flash",
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it",
];

function ModelOptions({ groups }: { groups: Record<string, string[]> }) {
  return (
    <>
      {Object.entries(groups).map(([label, values]) => (
        <optgroup key={label} label={label}>
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </optgroup>
      ))}
      <optgroup label="Custom">
        <option value="custom">Custom</option>
      </optgroup>
    </>
  );
}

function ServiceSelector({
  name,
  options,
  value: selectedValue,
  onChange,
}: {
  name: string;
  options: ServiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map(({ id, value, label }) => (
        <Fragment key={id}>
          <input
            type="radio"
            id={id}
            name={name}
            value={value}
            checked={value === selectedValue}
            onChange={() => onChange(value)}
          />
          <label htmlFor={id}>{label}</label>
        </Fragment>
      ))}
    </div>
  );
}

export function CloudSettings() {
  const data = useOptions();
  const visible = cloudVisibility(data.cloud);
  const savedGeminiModel = fieldValue(data, "settings", "cloudModelName");
  return (
    <>
      <h2>Cloud AI Settings</h2>
      <div>
        <div className="form-group">
          <label>Cloud Service</label>
          <ServiceSelector
            name="cloudSelection"
            value={data.cloud}
            onChange={data.setCloud}
            options={[
              { id: "cloud-select-gemini", value: "gemini", label: "Gemini" },
              {
                id: "cloud-select-gateway",
                value: "gateway",
                label: "Vertex AI",
              },
              {
                id: "cloud-select-azure-foundry",
                value: "azure-foundry",
                label: "AI Foundry",
              },
              {
                id: "cloud-select-mistral",
                value: "mistral",
                label: "Mistral",
              },
            ]}
          />
        </div>
        <div id="cloud-settings-container">
          <div
            id="proxy-url-container"
            className={`form-group${visible.gateway ? "" : " hidden"}`}
          >
            <label htmlFor="cloud-proxy-url-input">API Gateway Endpoint</label>
            <input
              type="text"
              id="cloud-proxy-url-input"
              data-storage-key="cloudProxyUrl"
              data-storage-type="settings"
              defaultValue={fieldValue(data, "settings", "cloudProxyUrl")}
              placeholder="Enter your API Gateway Endpoint here"
            />
          </div>
          <div
            id="gcp-api-key-container"
            className={`form-group${visible.gateway ? "" : " hidden"}`}
          >
            <label htmlFor="gcp-api-key-input">GCP API Key</label>
            <input
              type="password"
              id="gcp-api-key-input"
              data-storage-key="gcpApiKey"
              data-storage-type="settings"
              defaultValue={fieldValue(data, "settings", "gcpApiKey")}
              placeholder="Enter your GCP API Key"
            />
          </div>
          <div
            id="gemini-api-key-container"
            className={`form-group${visible.geminiKey ? "" : " hidden"}`}
          >
            <label htmlFor="cloud-api-key-input">Gemini API Key</label>
            <input
              type="password"
              id="cloud-api-key-input"
              data-storage-key="cloudApiKey"
              data-storage-type="settings"
              defaultValue={fieldValue(data, "settings", "cloudApiKey")}
              placeholder="Enter your API Key"
            />
          </div>
          <div
            id="gemini-model-container"
            className={`form-group${visible.geminiModel ? "" : " hidden"}`}
          >
            <label htmlFor="cloud-model-name-input">Gemini Model Name</label>
            <select
              id="cloud-model-name-input"
              data-storage-key="cloudModelName"
              data-storage-type="settings"
              defaultValue={savedGeminiModel}
            >
              {savedGeminiModel && !geminiModels.includes(savedGeminiModel) && (
                <option value={savedGeminiModel}>
                  {savedGeminiModel} (saved)
                </option>
              )}
              {geminiModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div
            id="mistral-api-key-container"
            className={`form-group${visible.mistral ? "" : " hidden"}`}
          >
            <label htmlFor="mistral-api-key-input">Mistral API Key</label>
            <input
              type="password"
              id="mistral-api-key-input"
              data-storage-key="mistralApiKey"
              data-storage-type="settings"
              defaultValue={fieldValue(data, "settings", "mistralApiKey")}
              placeholder="Enter your Mistral API Key"
            />
          </div>
          <div
            id="mistral-model-container"
            className={`form-group${visible.mistral ? "" : " hidden"}`}
          >
            <label htmlFor="mistral-model-name-select">
              Mistral Model Name
            </label>
            <select
              id="mistral-model-name-select"
              data-storage-key="mistralModelName"
              data-storage-type="settings"
              defaultValue={fieldValue(data, "settings", "mistralModelName")}
            >
              <option value="pixtral-large-latest">Pixtral Large</option>
              <option value="mistral-medium-latest">Mistral Medium</option>
            </select>
          </div>
          <div
            id="azure-foundry-container"
            className={visible.azure ? "" : "hidden"}
          >
            <div className="form-group">
              <label htmlFor="apim-endpoint-input">APIM Endpoint</label>
              <input
                type="text"
                id="apim-endpoint-input"
                data-storage-key="apimEndpoint"
                data-storage-type="settings"
                defaultValue={fieldValue(data, "settings", "apimEndpoint")}
                placeholder="Enter your APIM Endpoint URL"
              />
            </div>
            <div className="form-group">
              <label htmlFor="apim-subscription-key-input">
                APIM Subscription Key
              </label>
              <input
                type="password"
                id="apim-subscription-key-input"
                data-storage-key="apimSubscriptionKey"
                data-storage-type="settings"
                defaultValue={fieldValue(
                  data,
                  "settings",
                  "apimSubscriptionKey",
                )}
                placeholder="Enter your APIM Subscription Key"
              />
            </div>
            <div className="form-group">
              <label htmlFor="azure-foundry-model-name-input">
                AI Foundry Model Name
              </label>
              <input
                type="text"
                id="azure-foundry-model-name-input"
                data-storage-key="azureFoundryModelName"
                data-storage-type="settings"
                defaultValue={fieldValue(
                  data,
                  "settings",
                  "azureFoundryModelName",
                )}
                placeholder="Enter your model deployment name"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function LocalSettings() {
  const data = useOptions();
  const visible = localVisibility(data.local);
  return (
    <>
      <h2>Local AI Settings</h2>
      <div>
        <div className="form-group">
          <label>Local AI Service</label>
          <ServiceSelector
            name="localApiModeSelection"
            value={data.local}
            onChange={data.setLocal}
            options={[
              { id: "local-select-ollama", value: "ollama", label: "Ollama" },
              {
                id: "local-select-lmstudio",
                value: "lmstudio",
                label: "LM Studio",
              },
              { id: "local-select-vllm", value: "vllm", label: "vLLM" },
              {
                id: "local-select-gemini-nano",
                value: "gemini-nano",
                label: "Gemini Nano",
              },
            ]}
          />
        </div>
        <div
          id="vllm-url-container"
          className={`form-group${visible.vllm ? "" : " hidden"}`}
        >
          <label htmlFor="vllm-url-input">vLLM Server URL</label>
          <input
            type="text"
            id="vllm-url-input"
            data-storage-key="localApiUrl"
            data-storage-type="settings"
            defaultValue={fieldValue(data, "settings", "localApiUrl")}
            placeholder="e.g., http://localhost:8000"
          />
        </div>
        <div
          id="ollama-model-container"
          className={visible.ollama ? "" : "hidden"}
        >
          <div className="form-group">
            <label htmlFor="ollama-model-name-select">Ollama Model Name</label>
            <select
              id="ollama-model-name-select"
              data-storage-key="localMultimodalModel"
              data-storage-type="settings"
              defaultValue={
                data.ollamaCustom
                  ? "custom"
                  : fieldValue(data, "settings", "localMultimodalModel")
              }
              onChange={(event) =>
                data.setOllamaCustom(event.currentTarget.value === "custom")
              }
            >
              <ModelOptions groups={ollamaModels} />
            </select>
          </div>
          <div
            id="custom-ollama-model-container"
            className={`form-group${data.ollamaCustom ? "" : " hidden"}`}
          >
            <input
              type="text"
              id="custom-ollama-model-input"
              defaultValue={
                data.ollamaCustom
                  ? fieldValue(data, "settings", "localMultimodalModel")
                  : ""
              }
              placeholder="Enter custom Ollama model name"
            />
          </div>
        </div>
        <div
          id="lmstudio-model-container"
          className={visible.lmstudio ? "" : "hidden"}
        >
          <div className="form-group">
            <label htmlFor="lmstudio-model-name-select">
              LM Studio Model Name
            </label>
            <select
              id="lmstudio-model-name-select"
              data-storage-key="lmstudioModelName"
              data-storage-type="settings"
              defaultValue={
                data.lmstudioCustom
                  ? "custom"
                  : fieldValue(data, "settings", "lmstudioModelName")
              }
              onChange={(event) =>
                data.setLmstudioCustom(event.currentTarget.value === "custom")
              }
            >
              <ModelOptions groups={lmstudioModels} />
            </select>
          </div>
          <div
            id="custom-lmstudio-model-container"
            className={`form-group${data.lmstudioCustom ? "" : " hidden"}`}
          >
            <input
              type="text"
              id="custom-lmstudio-model-input"
              defaultValue={
                data.lmstudioCustom
                  ? fieldValue(data, "settings", "lmstudioModelName")
                  : ""
              }
              placeholder="Enter custom LM Studio model name"
            />
          </div>
        </div>
        <div
          id="vllm-model-container"
          className={`form-group${visible.vllm ? "" : " hidden"}`}
        >
          <label htmlFor="vllm-model-name-input">vLLM Model Name</label>
          <input
            type="text"
            id="vllm-model-name-input"
            data-storage-key="vllmModelName"
            data-storage-type="settings"
            defaultValue={fieldValue(data, "settings", "vllmModelName")}
            placeholder="Enter vLLM model name"
          />
        </div>
      </div>
    </>
  );
}

export function Preferences() {
  const data = useOptions();
  return (
    <>
      <h2>Preferences</h2>
      <div>
        <div className="llm-preferences form-group">
          <label htmlFor="role-select">Role</label>
          <select
            id="role-select"
            data-storage-key="active_system_prompt_key"
            data-storage-type="prompts"
            defaultValue={fieldValue(
              data,
              "prompts",
              "active_system_prompt_key",
            )}
          >
            <option value="web_assistant">Web Assistant</option>
            <option value="teacher">Study Mode</option>
          </select>
        </div>
        <div className="llm-preferences form-group">
          <label htmlFor="response-language-select">AI Response Language</label>
          <select
            id="response-language-select"
            data-storage-key="responseLanguage"
            data-storage-type="prompts"
            defaultValue={fieldValue(data, "prompts", "responseLanguage")}
          >
            {languageOptions(availableResponseLanguages)}
          </select>
        </div>

        <hr className="preferences-divider" />

        <div className="voice-preferences form-group">
          <label htmlFor="stt-language-select">Voice Input Language</label>
          <select
            id="stt-language-select"
            data-storage-key="sttLanguage"
            data-storage-type="voice"
            defaultValue={fieldValue(data, "voice", "sttLanguage")}
          >
            {languageOptions(availableLanguages)}
          </select>
        </div>
        <div className="voice-preferences form-group">
          <label htmlFor="tts-voice-select">Voice Output Language</label>
          <select
            id="tts-voice-select"
            data-storage-key="ttsVoiceName"
            data-storage-type="voice"
            value={data.selectedVoice}
            disabled={!data.voices.length}
            onChange={(event) =>
              data.setSelectedVoice(event.currentTarget.value)
            }
          >
            <option value="">
              {data.voices.length
                ? "-- Select a Voice --"
                : "No voices available"}
            </option>
            {data.voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang}){voice.default ? " [Default]" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

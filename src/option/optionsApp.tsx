import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { voiceSettingsStorageKey } from "./languagesSettings";
import { cloudSelectionFromSettings } from "./providerSelection";
import { ollamaModels, lmstudioModels, isCustomModel } from "./modelChoices";
import { selectVoice } from "./voiceSelection";
import {
  createOptionsWriter,
  initialOptions,
  readOptions,
  type OptionData,
  type OptionUpdates,
} from "./optionsStorage";
import { OptionsContext } from "./optionsContext";
import { CloudSettings, LocalSettings, Preferences } from "./settings-cards";

function ResourceCard() {
  return (
    <>
      <h2>Resource</h2>
      <div className="resource-links">
        <a href="https://aistudio.google.com/welcome" target="_blank">
          Get Gemini API Key
        </a>
        <a href="https://mistral.ai/" target="_blank">
          Get Mistral API Key
        </a>
        <a
          href="https://github.com/vincentwun/A-Eye-Web-Chat-Assistant/blob/main/README.md"
          target="_blank"
        >
          User Manual
        </a>
      </div>
    </>
  );
}

function collectOptions(
  form: HTMLFormElement,
  localService: string,
  cloudService: string,
): OptionUpdates {
  const updates: OptionUpdates = {
    settings: {},
    prompts: {},
    voice: {},
    localService,
    cloudService,
  };
  for (const element of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >("[data-storage-key]")) {
    const area = element.dataset.storageType;
    const key = element.dataset.storageKey;
    if (!key || (area !== "settings" && area !== "prompts" && area !== "voice"))
      continue;
    updates[area][key] =
      element.type === "range"
        ? Number.parseInt(element.value, 10)
        : element.value;
  }
  for (const [selectId, inputId, key] of [
    [
      "ollama-model-name-select",
      "custom-ollama-model-input",
      "localMultimodalModel",
    ],
    [
      "lmstudio-model-name-select",
      "custom-lmstudio-model-input",
      "lmstudioModelName",
    ],
  ]) {
    const select = form.querySelector<HTMLSelectElement>(`#${selectId}`);
    if (select?.value === "custom")
      updates.settings[key] =
        form.querySelector<HTMLInputElement>(`#${inputId}`)?.value ?? "";
  }
  return updates;
}

function OptionsApp() {
  const [initial, setInitial] = useState<OptionData | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [cloud, setCloud] = useState("gemini");
  const [local, setLocal] = useState("ollama");
  const cloudRef = useRef("gemini");
  const localRef = useRef("ollama");
  const [ollamaCustom, setOllamaCustom] = useState(false);
  const [lmstudioCustom, setLmstudioCustom] = useState(false);
  const [scale, setScale] = useState(100);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const voiceRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const writer = useMemo(() => createOptionsWriter(chrome.storage.local), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await readOptions(chrome.storage.local);
        if (
          saved.voice.sttLanguage === undefined ||
          saved.voice.ttsVoiceName === undefined
        ) {
          saved.voice = {
            sttLanguage: "en-US",
            ttsVoiceName: "",
            ttsLanguage: "en-US",
          };
          await chrome.storage.local.set({
            [voiceSettingsStorageKey]: saved.voice,
          });
        }
        if (!active) return;
        const next = initialOptions(saved);
        const { settings } = next;
        const nextScale = Number(saved.settings.uiScale ?? 100);
        setScale(nextScale);
        document.documentElement.style.fontSize = `${nextScale}%`;
        const cloudService = cloudSelectionFromSettings(
          String(settings.cloudProvider),
          String(settings.cloudApiMethod),
        );
        cloudRef.current = cloudService;
        setCloud(cloudService);
        const mode = String(settings.localApiMode);
        localRef.current = [
          "ollama",
          "lmstudio",
          "vllm",
          "gemini-nano",
        ].includes(mode)
          ? mode
          : "ollama";
        setLocal(localRef.current);
        setOllamaCustom(
          isCustomModel(ollamaModels, String(settings.localMultimodalModel)),
        );
        setLmstudioCustom(
          isCustomModel(lmstudioModels, String(settings.lmstudioModelName)),
        );
        voiceRef.current = String(saved.voice.ttsVoiceName ?? "");
        setInitial(next);
      } catch (error) {
        if (active)
          setNotice({
            text: `Error loading settings: ${error instanceof Error ? error.message : String(error)}`,
            error: true,
          });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initial || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    let active = true;
    const updateVoices = () => {
      const list = synth.getVoices();
      if (!active) return;
      setVoices(list);
      if (!list.length) {
        setSelectedVoice("");
        return;
      }
      const selected = selectVoice(list, voiceRef.current, "");
      setSelectedVoice(selected.name);
      if (selected.persist) {
        voiceRef.current = selected.name;
        void writer.setDefaultVoice(selected.name).catch((error) =>
          setNotice({
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            error: true,
          }),
        );
      }
    };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => {
      active = false;
      synth.removeEventListener("voiceschanged", updateVoices);
    };
  }, [initial, writer]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const save = () => {
    if (!formRef.current || !initial) return;
    const updates = collectOptions(
      formRef.current,
      localRef.current,
      cloudRef.current,
    );
    voiceRef.current = String(updates.voice.ttsVoiceName ?? "");
    void writer(updates).then(
      () => setNotice({ text: "Saved successfully.", error: false }),
      (error) =>
        setNotice({
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          error: true,
        }),
    );
  };
  const onChange = (event: FormEvent<HTMLFormElement>) => {
    const element = event.target;
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
    )
      return;
    if (element.id === "ui-scale-slider") {
      setScale(Number(element.value));
      document.documentElement.style.fontSize = `${element.value}%`;
    }
    if (
      element instanceof HTMLSelectElement ||
      ["radio", "checkbox", "range"].includes(element.type)
    )
      save();
  };
  const onBlur = (event: FormEvent<HTMLFormElement>) => {
    const element = event.target;
    if (
      element instanceof HTMLInputElement &&
      ["text", "password"].includes(element.type)
    )
      save();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      event.target instanceof HTMLInputElement &&
      ["text", "password"].includes(event.target.type)
    ) {
      event.preventDefault();
      event.target.blur();
    }
  };
  const context = initial && {
    ...initial,
    cloud,
    local,
    setCloud: (value: string) => {
      cloudRef.current = value;
      setCloud(value);
    },
    setLocal: (value: string) => {
      localRef.current = value;
      setLocal(value);
    },
    ollamaCustom,
    lmstudioCustom,
    setOllamaCustom,
    setLmstudioCustom,
    voices,
    selectedVoice,
    setSelectedVoice,
  };
  return (
    <>
      <div
        id="notification-bar"
        className={`${notice ? "show" : ""}${notice?.error ? " error" : ""}`}
      >
        {notice?.text}
      </div>
      {context && (
        <OptionsContext.Provider value={context}>
          <form
            className="container"
            ref={formRef}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div id="resource-card" className="card">
              <ResourceCard />
            </div>
            <div id="display-size-card" className="card">
              <h2>Display Size</h2>
              <div className="form-group">
                <div className="slider-container">
                  <input
                    type="range"
                    id="ui-scale-slider"
                    min="80"
                    max="150"
                    step="5"
                    data-storage-key="uiScale"
                    data-storage-type="settings"
                    aria-label="Adjust Size"
                    defaultValue={scale}
                  />
                  <span id="ui-scale-value">{scale}%</span>
                </div>
              </div>
            </div>
            <div id="cloud-settings-card" className="card">
              <CloudSettings />
            </div>
            <div id="local-settings-card" className="card">
              <LocalSettings />
            </div>
            <div id="preferences-card" className="card">
              <Preferences />
            </div>
            <div className="button-container">
              <button id="save-button" type="submit">
                Save
              </button>
            </div>
          </form>
        </OptionsContext.Provider>
      )}
    </>
  );
}

const root = document.getElementById("options-root");
export const mountedOptions = root ? createRoot(root) : null;
mountedOptions?.render(<OptionsApp />);

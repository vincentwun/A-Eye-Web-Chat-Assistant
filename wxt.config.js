import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import { join } from "node:path";

export default defineConfig({
  vite: () => ({ plugins: [react()] }),
  publicDir: "src",
  manifest: {
    name: "A-Eye Web Chat Assistant",
    version: "2.0.21",
    description:
      "Analyzes screen content using local AI (Gemini Nano, Ollama, LM Studio, vLLM) and cloud AI (Gemini, Mistral).",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    permissions: [
      "sidePanel",
      "scripting",
      "microphone",
      "audioCapture",
      "commands",
      "storage",
      "tabs",
      "activeTab",
    ],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Open A-Eye Web Chat Assistant" },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    commands: {
      "toggle-api-mode": {
        suggested_key: { default: "Alt+Shift+1", mac: "Alt+Shift+1" },
        description: "Toggle between local and cloud AI",
      },
      "toggle-voice-input": {
        suggested_key: { default: "Alt+Shift+2", mac: "Alt+Shift+2" },
        description: "Toggle voice input for chat",
      },
      "toggle-repeat": {
        suggested_key: { default: "Alt+Shift+3", mac: "Alt+Shift+3" },
        description: "Repeat last AI response",
      },
      _execute_action: {
        suggested_key: { default: "Alt+Shift+Q", mac: "Alt+Shift+Q" },
        description: "Open Extension",
      },
    },
    web_accessible_resources: [
      {
        resources: [
          "permission/permission.html",
          "permission/requestPermission.js",
        ],
        matches: ["<all_urls>"],
      },
    ],
  },
  hooks: {
    "entrypoints:resolved": (wxt, entrypoints) => {
      const permission = entrypoints.find(
        (entry) =>
          entry.type === "unlisted-script" &&
          entry.name === "requestPermission",
      );
      if (permission)
        permission.outputDir = join(wxt.config.outDir, "permission");
    },
    "build:publicAssets": (_wxt, files) => {
      // Source modules are bundled by WXT. Only files used as static resources
      // belong in the extension package.
      const staticPaths =
        /^(?:icons\/|main\/styles\.css$|option\/options\.css$|permission\/permission\.html$)/;
      const keep = files.filter((file) =>
        staticPaths.test(file.relativeDest.replaceAll("\\", "/")),
      );
      files.splice(0, files.length, ...keep);
    },
  },
});

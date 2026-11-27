import { serviceConfigurations } from '../option/apiRoute.ts';

type ServiceConfig = {
    requiredFields: string[];
    labels: Record<string, string>;
    messageTemplate: string;
    speechTemplate: string;
    serviceName: string;
};
type Dependencies = {
    stateManager: { getState(): Record<string, unknown> };
    appendMessage(role: string, message: string): void;
    voiceController: { speakText(message: string): unknown };
};

export class ConfigValidator {
    private stateManager: Dependencies['stateManager'];
    private appendMessage: Dependencies['appendMessage'];
    private voiceController: Dependencies['voiceController'];

    constructor(dependencies: Dependencies) {
        this.stateManager = dependencies.stateManager;
        this.appendMessage = dependencies.appendMessage;
        this.voiceController = dependencies.voiceController;
    }

    _validateConfig(configType: 'local' | 'cloud', serviceName: unknown) {
        const state = this.stateManager.getState();
        const configs = serviceConfigurations as Record<string, Record<string, ServiceConfig>>;
        const config = typeof serviceName === 'string' ? configs[configType]?.[serviceName] : undefined;

        if (!config) {
            const msg = `Configuration for service "${serviceName}" not found.`;
            this.appendMessage('system', msg);
            this.voiceController.speakText('Configuration error.');
            return false;
        }

        const missingFields = config.requiredFields.filter(field => !state[field]);

        if (missingFields.length > 0) {
            missingFields.forEach(field => {
                const fieldLabel = config.labels[field] || field;
                const message = config.messageTemplate.replace('[FIELD_LABEL]', fieldLabel);
                this.appendMessage('system', message);
            });

            const firstMissingField = missingFields[0];
            const firstFieldLabel = config.labels[firstMissingField] || firstMissingField;
            const speechMessage = config.speechTemplate
                .replace('[SERVICE_NAME]', config.serviceName)
                .replace('[FIELD_LABEL]', firstFieldLabel);

            this.voiceController.speakText(speechMessage);
            return false;
        }

        return true;
    }

    isLocalModeConfigValid() {
        const state = this.stateManager.getState();
        const localApiService = state.localApiMode;
        return this._validateConfig('local', localApiService);
    }

    isCloudModeConfigValid() {
        const state = this.stateManager.getState();
        const cloudProvider = state.cloudProvider;
        let serviceName;

        if (cloudProvider === 'gemini') {
            serviceName = state.cloudApiMethod === 'proxy' ? 'gemini-proxy' : 'gemini-direct';
        } else {
            serviceName = cloudProvider;
        }

        return this._validateConfig('cloud', serviceName);
    }
}

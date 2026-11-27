import hljs from 'highlight.js';

export type PanelMessage =
  | { id: number; kind: 'html'; role: string; html: string }
  | { id: number; kind: 'user'; text: string; imageUrl: string | null }
  | { id: number; kind: 'preview'; imageUrl?: string; html?: string };

export interface PanelState {
  mode: string;
  input: string;
  pastedImage: string | null;
  processing: boolean;
  recording: boolean;
  thinking: boolean;
  messages: PanelMessage[];
}

type PanelHandlers = {
  onScreenshot(): void; onScrollingScreenshot(): void; onAnalyzeContent(): void;
  onGetElements(): void; onSendMessage(): void; onToggleVoice(): void; onRepeat(): void;
  onModeChangeLocal(): void; onModeChangeCloud(): void; onClear(): void;
  onRemovePastedImage(): void; onOpenOptions(): void;
  onPaste(event: ClipboardEvent): void; onUserInputKeypress(event: KeyboardEvent): void;
};
export type PanelVoice = { startThinkingSoundLoop(): void; stopThinkingSoundLoop(): void };

/** Adapter between the existing action controllers and the React view. */
export class PanelViewModel {
  private state: PanelState = { mode: 'local', input: '', pastedImage: null, processing: false, recording: false, thinking: false, messages: [] };
  private listeners = new Set<() => void>();
  private nextId = 0;
  handlers: Partial<PanelHandlers> = {};
  private voice: PanelVoice;
  constructor(voice: PanelVoice) { this.voice = voice; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<PanelState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private add(message: Omit<Extract<PanelMessage, {kind: 'html'}>, 'id'> | Omit<Extract<PanelMessage, {kind: 'user'}>, 'id'> | Omit<Extract<PanelMessage, {kind: 'preview'}>, 'id'>) {
    this.update({ messages: [...this.state.messages, { ...message, id: this.nextId++ } as PanelMessage] });
  }
  bindEventListeners(handlers: PanelHandlers) { this.handlers = handlers; }
  setInput(input: string) { this.update({ input }); }
  getUserInput() { return this.state.input.trim(); }
  isPastedImageVisible() { return this.state.pastedImage !== null; }
  applyUIScale(scale: number) { document.documentElement.style.fontSize = `${scale}%`; }
  focusUserInput() { document.getElementById('user-input')?.focus(); }
  appendMessage(role: string, html: string) { this.add({ kind: 'html', role, html }); }
  async appendUserMessageWithImage({ text, imageUrl }: { text: string; imageUrl: string | null }) {
    this.add({ kind: 'user', text, imageUrl: imageUrl ? await createThumbnail(imageUrl, 150) : null });
  }
  async appendPreviewMessage(type: string, content: string) {
    this.add(type === 'image' ? { kind: 'preview', imageUrl: await createThumbnail(content, 100) } : { kind: 'preview', html: content });
  }
  showThinkingIndicator() { if (!this.state.thinking) { this.update({ thinking: true }); this.voice?.startThinkingSoundLoop(); } }
  hideThinkingIndicator() { this.voice?.stopThinkingSoundLoop(); this.update({ thinking: false }); }
  updateModeUI(mode: string) { this.update({ mode }); }
  updateInputState() { /* Send availability is derived from input and image state. */ }
  setProcessingState(processing: boolean) { this.update({ processing, recording: processing ? false : this.state.recording }); }
  updateVoiceButtonState(recording: boolean) { this.update({ recording }); }
  clearConversation() { this.update({ messages: [], pastedImage: null }); }
  clearUserInput() { this.update({ input: '' }); }
  escapeHTML(value: string) { const p = document.createElement('p'); p.textContent = value || ''; return p.innerHTML.replace(/\n/g, '<br>'); }
  showPastedImagePreview(pastedImage: string) { this.update({ pastedImage }); }
  hidePastedImagePreview() { this.update({ pastedImage: null }); }
}

function createThumbnail(dataUrl: string, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      let { width, height } = img;
      if (height > maxHeight) { width = maxHeight / height * width; height = maxHeight; }
      canvas.width = width; canvas.height = height;
      context!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = error => { console.error('Failed to load image for thumbnail creation', error); reject(new Error('Failed to load image for thumbnail creation.')); };
    img.src = dataUrl;
  });
}

/** Enhance rendered Markdown with the same highlighting and copy control as the original UI. */
export function enhanceCodeBlocks(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('pre > code').forEach(codeBlock => {
    const pre = codeBlock.parentElement!;
    const wrapper = document.createElement('div'); wrapper.className = 'code-block-container';
    const header = document.createElement('div'); header.className = 'code-block-header';
    const language = document.createElement('span'); language.className = 'language-name';
    const langClass = Array.from(codeBlock.classList).find(cls => cls.startsWith('language-'));
    language.textContent = langClass ? langClass.replace('language-', '') : 'code';
    const copy = document.createElement('button'); copy.className = 'copy-button';
    copy.innerHTML = '<i class="far fa-copy"></i> Copy';
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(codeBlock.textContent || '').then(() => {
        copy.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => { copy.innerHTML = '<i class="far fa-copy"></i> Copy'; }, 2000);
      }).catch(error => { console.error('Failed to copy text: ', error); copy.textContent = 'Copy Failed'; });
    });
    header.append(language, copy); pre.parentNode!.insertBefore(wrapper, pre); wrapper.append(header, pre);
    hljs.highlightElement(codeBlock);
  });
}

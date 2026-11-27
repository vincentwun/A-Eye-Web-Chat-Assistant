import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelViewModel, enhanceCodeBlocks, type PanelVoice, type PanelMessage } from './panel-view-model';
import { flushSync } from 'react-dom';
import './styles.js';
import { initializeApp } from '../../src/main/sidepanel.ts';

function escapeMessageText(text: string) {
  const element = document.createElement('p');
  element.textContent = text;
  return element.innerHTML.replace(/\n/g, '<br>');
}

function Message({ message }: { message: PanelMessage }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (message.kind === 'html' && ref.current) enhanceCodeBlocks(ref.current); }, [message]);
  if (message.kind === 'html') return <div ref={ref} className={`message message-${message.role}`} dangerouslySetInnerHTML={{ __html: message.html }} />;
  if (message.kind === 'user') return <div className="message message-user">
    {message.text ? <div className="message-text" dangerouslySetInnerHTML={{ __html: escapeMessageText(message.text) }} /> : null}
    {message.imageUrl ? <div className="message-image-container"><img src={message.imageUrl} /></div> : null}
  </div>;
  return <div className="message message-user message-preview">{message.imageUrl ? <img src={message.imageUrl} /> : <pre dangerouslySetInnerHTML={{ __html: message.html || '' }} />}</div>;
}

function SidePanel({ model }: { model: PanelViewModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const conversation = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; }, [state.messages, state.thinking]);
  return (<>
<header className="header-section">
        <span id="current-mode-indicator" className="mode-indicator">Mode: {state.mode === 'local' ? 'Local' : 'Cloud'}</span>
        <nav className="button-group">
            <button id="local-mode-button" onClick={() => model.handlers.onModeChangeLocal?.()} disabled={state.processing} className={`mode-button action-button${state.mode === 'local' ? ' active-mode' : ''}`} data-tooltip="Local Mode"
                data-tooltip-position="bottom">
                <i className="fas fa-desktop"></i>
            </button>
            <button id="cloud-mode-button" onClick={() => model.handlers.onModeChangeCloud?.()} disabled={state.processing} className={`mode-button action-button${state.mode !== 'local' ? ' active-mode' : ''}`} data-tooltip="Cloud Mode"
                data-tooltip-position="bottom">
                <i className="fas fa-cloud"></i>
            </button>
            <button id="options-button" onClick={() => model.handlers.onOpenOptions?.()} className="action-button" data-tooltip="Settings" data-tooltip-position="bottom">
                <i className="fas fa-cog"></i>
            </button>
            <a href="https://github.com/vincentwun/A-Eye-Web-Chat-Assistant" target="_blank" rel="noopener noreferrer"
                className="action-button" data-tooltip="Github" data-tooltip-position="bottom-right">
                <i className="fa-brands fa-github"></i>
            </a>
        </nav>
    </header>

    <main className="content-wrapper">
        <div id="conversation" ref={conversation}>
            {state.messages.map(message => <Message key={message.id} message={message} />)}
            {state.thinking ? <div id="thinking-indicator" className="message message-assistant"><div className="dot-flashing" /></div> : null}
        </div>
    </main>

    <div id="input-section">
        <div id="pasted-image-preview-container" style={{ display: state.pastedImage === null ? 'none' : 'block' }}>
            <img id="pasted-image-preview" src={state.pastedImage || ''} alt="Pasted image preview" />
            <button id="remove-pasted-image-button" onClick={() => model.handlers.onRemovePastedImage?.()} disabled={state.processing} className="action-button">
                <i className="fas fa-times"></i>
            </button>
        </div>
        <textarea id="user-input" rows={1} placeholder="Ask anything..." value={state.input} disabled={state.processing}
            onChange={event => model.setInput(event.currentTarget.value)}
            onPaste={event => model.handlers.onPaste?.(event.nativeEvent)}
            onKeyPress={event => model.handlers.onUserInputKeypress?.(event.nativeEvent)}></textarea>
        <div className="input-controls-row">
            <div className="input-action-buttons-left">
                <button id="screenshot-button" onClick={() => model.handlers.onScreenshot?.()} disabled={state.processing} className="action-button" data-tooltip="Capture visible"
                    data-tooltip-position="top-left">
                    <i className="fas fa-camera"></i>
                </button>
                <button id="scrolling-screenshot-button" onClick={() => model.handlers.onScrollingScreenshot?.()} disabled={state.processing} className="action-button" data-tooltip="Capture full page"
                    data-tooltip-position="top-left">
                    <i className="fas fa-file-arrow-down"></i>
                </button>
                <button id="analyze-content-button" onClick={() => model.handlers.onAnalyzeContent?.()} disabled={state.processing} className="action-button" data-tooltip="Analyze content"
                    data-tooltip-position="top-left">
                    <i className="fas fa-file-export"></i>
                </button>
                <button id="get-element-button" onClick={() => model.handlers.onGetElements?.()} disabled={state.processing} className="action-button" data-tooltip="Get Element"
                    data-tooltip-position="top-left">
                    <i className="fas fa-code"></i>
                </button>
            </div>

            <div className="input-action-buttons-right">
                <button id="voiceInput-button" onClick={() => model.handlers.onToggleVoice?.()} disabled={state.processing} className={`action-button${state.recording ? ' active-recording' : ''}`} data-tooltip="Voice Input"
                    data-tooltip-position="top-right">
                    <i className={state.recording ? 'fas fa-stop' : 'fas fa-microphone'}></i>
                </button>
                <button id="repeat-button" onClick={() => model.handlers.onRepeat?.()} disabled={state.processing} className="action-button" data-tooltip="Repeat"
                    data-tooltip-position="top-right">
                    <i className="fas fa-redo"></i>
                </button>
                <button id="send-button" onClick={() => model.handlers.onSendMessage?.()} disabled={state.processing || (!state.input.trim() && !state.pastedImage)} className="action-button" data-tooltip="Send" data-tooltip-position="top-right">
                    <i className="fas fa-paper-plane"></i>
                </button>
                <button id="clear-button" onClick={() => model.handlers.onClear?.()} disabled={state.processing} className="action-button" data-tooltip="Clear" data-tooltip-position="top-right">
                    <i className="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    </div>
  </>);
}

const root = document.getElementById('sidepanel-root');
if (root) {
  let model: PanelViewModel;
  // The controller creates the model before its asynchronous initialization completes.
  initializeApp((voice: PanelVoice) => {
    model = new PanelViewModel(voice);
    flushSync(() => createRoot(root).render(<SidePanel model={model} />));
    return model;
  });
}

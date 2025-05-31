/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement, svg } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';
import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage } from '@google/genai';

import { decode, decodeAudioData } from './utils/audio'
import { throttle } from './utils/throttle'
import { AudioAnalyser } from './utils/AudioAnalyser';
import { MidiDispatcher } from './utils/MidiDispatcher';

import './components/WeightKnob';
import './components/PromptController';
import { ToastMessage } from './components/ToastMessage';

import type { Prompt, PlaybackState } from './types';


const DEFAULT_PROMPTS = [
  { color: '#9900ff', text: 'Bossa Nova' },
  { color: '#5200ff', text: 'Chillwave' },
  { color: '#ff25f6', text: 'Drum and Bass' },
  { color: '#2af6de', text: 'Post Punk' },
  { color: '#ffdd28', text: 'Shoegaze' },
  { color: '#2af6de', text: 'Funk' },
  { color: '#9900ff', text: 'Chiptune' },
  { color: '#3dffab', text: 'Lush Strings' },
  { color: '#d8ff3e', text: 'Sparkling Arpeggios' },
  { color: '#d9b2ff', text: 'Staccato Rhythms' },
  { color: '#3dffab', text: 'Punchy Kick' },
  { color: '#ffdd28', text: 'Dubstep' },
  { color: '#ff25f6', text: 'K Pop' },
  { color: '#d8ff3e', text: 'Neo Soul' },
  { color: '#5200ff', text: 'Trip Hop' },
  { color: '#d9b2ff', text: 'Thrash' },
];

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      margin-top: 8vmin;
    }
    prompt-controller {
      width: 100%;
    }
    #buttons {
      position: absolute;
      top: 0;
      left: 0;
      padding: 5px;
      display: flex;
      gap: 5px;
    }
    button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      &.active {
        background-color: #fff;
        color: #000;
      }
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
    #main-audio-button {
      width: 60px; /* From user feedback */
      height: 60px; /* From user feedback */
      border-radius: 50%; /* From user feedback */
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3); /* From user feedback */
      border: 4px solid #222; /* From user feedback */
      position: absolute;
      top: 5vmin; /* Adjusted to 5vmin */
      right: 2.5vmin;
      transition: background 0.3s ease; /* For smooth color transition */
      font-size: 0; /* Hide default button text */
    }
    #main-audio-button.is-on {
      background: #ff5555; /* Red for ON state */
      animation: rgb-light 10s linear infinite; /* RGB light animation, slowed down to 10s */
    }
    #main-audio-button.is-off {
      background: #555; /* Grey for OFF state */
    }
    #main-audio-button .inner-circle {
      width: 20px; /* From user feedback */
      height: 20px; /* From user feedback */
      border-radius: 50%; /* From user feedback */
      box-shadow: 0 1px 3px rgba(0,0,0,0.5); /* From user feedback */
      transition: background 0.3s ease; /* For smooth color transition */
    }
    #main-audio-button.is-on .inner-circle {
      background: #fff; /* White for ON state */
    }
    #main-audio-button.is-off .inner-circle {
      background: #bbb; /* Light grey for OFF state */
    }
    #main-audio-button .status-text {
      position: absolute;
      top: -30px; /* Position above the button */
      font-weight: bold;
      font-size: 16px; /* Adjust font size as needed */
    }
    #main-audio-button.is-on .status-text {
      color: #ff5555; /* Red for ON state */
    }
    #main-audio-button.is-off .status-text {
      color: #555; /* Grey for OFF state */
    }
    #main-audio-button .loader {
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      animation: spin linear 1s infinite;
      transform-origin: center;
      transform-box: fill-box;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(359deg); }
    }
    @keyframes rgb-light {
      0% { background-color: #ff0000; } /* Red */
      16% { background-color: #ffff00; } /* Yellow */
      33% { background-color: #00ff00; } /* Green */
      50% { background-color: #00ffff; } /* Cyan */
      66% { background-color: #0000ff; } /* Blue */
      83% { background-color: #ff00ff; } /* Magenta */
      100% { background-color: #ff0000; } /* Red */
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private audioAnalyser: AudioAnalyser | null = null;

  @state() private playbackState: PlaybackState = 'stopped';
  @state() private audioReady = false; // State for audio context readiness

  private session!: LiveMusicSession; // Initialized in connectToSession
  private audioContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private readonly bufferTime = 2; // adds an audio buffer in case of network latency

  private ai!: GoogleGenAI;
  @state() private geminiApiKey: string | null = null;
  private readonly model = 'lyria-realtime-exp';


  @property({ type: Boolean }) private showMidi = false;
  @state() private audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @state()
  private filteredPrompts = new Set<string>();

  @state() private showAdvanced = false;
  @state() private config = { seed: null as number | null, bpm: null as number | null, density: 0.5, brightness: 0.5, scale: '', muteBass: false, muteDrums: false, onlyBassAndDrums: false, };
  @state() private lastDefinedDensity = 0.5;
  @state() private autoDensity = true;
  @state() private lastDefinedBrightness = 0.5;
  @state() private autoBrightness = true;

  private audioLevelRafId: number | null = null;
  private connectionError = true;

  @query('toast-message') private toastMessage!: ToastMessage;

  constructor(
    prompts: Map<string, Prompt>,
    midiDispatcher: MidiDispatcher,
  ) {
    super();
    this.prompts = prompts;
    this.midiDispatcher = midiDispatcher;
    this.updateAudioLevel = this.updateAudioLevel.bind(this);

    this.geminiApiKey = localStorage.getItem('geminiApiKey');
    // If API key is already set, hide the input field by default

    if (this.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.geminiApiKey, apiVersion: 'v1alpha' });
      // Initially hide the API key field if a key is saved, but allow it to reappear on error
    }
  }

  override async firstUpdated() {
    // Ensure toastMessage is ready before connecting to session
    await customElements.whenDefined('toast-message');
  }

  private async connectToSession() {
    if (!this.geminiApiKey) {
      this.toastMessage.show('Please enter your Gemini API key to connect to the session.');
      return;
    }

    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: this.geminiApiKey, apiVersion: 'v1alpha' });
    }

    try {
      this.session = await this.ai.live.music.connect({
        model: this.model,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => {
            if (e.setupComplete) {
              this.connectionError = false;
            }
            if (e.filteredPrompt) {
              this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text as string])
              if (this.toastMessage && typeof this.toastMessage.show === 'function') {
                this.toastMessage.show(e.filteredPrompt.filteredReason as string);
              }
            }
            if (e.serverContent?.audioChunks !== undefined) {
              if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
              if (!this.audioContext || !this.outputNode) {
                // Also show a toast message here if audio context is not initialized.
                if (this.toastMessage && typeof this.toastMessage.show === 'function') {
                  this.toastMessage.show('Audio context not initialized. Please refresh.');
                }
                console.error('AudioContext or outputNode not initialized.');
                return;
              }
              const audioBuffer = await decodeAudioData(
                decode(e.serverContent?.audioChunks[0].data),
                this.audioContext,
                48000,
                2,
              );
              const source = this.audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              if (this.nextStartTime === 0) {
                this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
                setTimeout(() => {
                  this.playbackState = 'playing';
                }, this.bufferTime * 1000);
              }

              if (this.nextStartTime < this.audioContext.currentTime) {
                this.playbackState = 'loading';
                this.nextStartTime = 0;
                return;
              }
              source.start(this.nextStartTime);
              this.nextStartTime += audioBuffer.duration;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.connectionError = true;
            this.stop();
            if (this.toastMessage && typeof this.toastMessage.show === 'function') {
              this.toastMessage.show('Connection error, please restart audio.');
            }
          },
          onclose: (e: CloseEvent) => {
            this.connectionError = true;
            this.stop();
            if (this.toastMessage && typeof this.toastMessage.show === 'function') {
              this.toastMessage.show('Connection error, please restart audio.');
            }
          },
        },
      });
    } catch (error) {
      this.connectionError = true;
      this.stop();
      if (this.toastMessage && typeof this.toastMessage.show === 'function') {
        this.toastMessage.show('Failed to connect to session. Check your API key.');
      }
      console.error('Failed to connect to session:', error);
    }
  }

  private getPromptsToSend() {
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight !== 0;
      })
  }

  private setSessionPrompts = throttle(async () => {
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      if (this.toastMessage && typeof this.toastMessage.show === 'function') {
        this.toastMessage.show('There needs to be one active prompt to play.')
      }
      this.pause();
      return;
    }
    try {
      if (this.session) { // Add null check for this.session
        await this.session.setWeightedPrompts({
          weightedPrompts: promptsToSend,
        });
      }
    } catch (e: unknown) { // Explicitly type e as unknown
      if (e instanceof Error) {
        if (this.toastMessage && typeof this.toastMessage.show === 'function') {
          this.toastMessage.show(e.message)
        }
      } else {
        if (this.toastMessage && typeof this.toastMessage.show === 'function') {
          this.toastMessage.show('An unknown error occurred.')
        }
      }
      this.pause();
    }
  }, 200);

  private updateAudioLevel() {
    this.audioLevelRafId = requestAnimationFrame(this.updateAudioLevel);
    if (this.audioAnalyser) {
      this.audioLevel = this.audioAnalyser.getCurrentLevel();
    }
  }

  private dispatchPromptsChange() {
    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
    return this.setSessionPrompts();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.setPrompts(newPrompts);
  }

  private setPrompts(newPrompts: Map<string, Prompt>) {
    this.prompts = newPrompts;
    this.requestUpdate();
    this.dispatchPromptsChange();
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30, // don't re-render more than once every XXms
  );

  private pause() {
    if (this.session) { // Add null check for this.session
      this.session.pause();
    }
    this.playbackState = 'paused';
    if (this.outputNode && this.audioContext) {
      this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    }
    this.nextStartTime = 0;
    if (this.audioContext) {
      this.outputNode = this.audioContext.createGain();
      this.outputNode.connect(this.audioContext.destination);
      if (this.audioAnalyser) {
        this.outputNode.connect(this.audioAnalyser.node);
      }
    }
  }

  private play() {
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      if (this.toastMessage && typeof this.toastMessage.show === 'function') {
        this.toastMessage.show('There needs to be one active prompt to play. Turn up a knob to resume playback.')
      }
      this.pause();
      return;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.audioAnalyser = new AudioAnalyser(this.audioContext);
      this.audioAnalyser.node.connect(this.audioContext.destination);
      this.outputNode = this.audioContext.createGain();
      this.outputNode.connect(this.audioAnalyser.node);
      this.updateAudioLevel(); // Start updating audio level once context is created
    }

    this.audioContext.resume();
    this.audioReady = true; // Set audioReady to true after context resumes
    if (this.session) { // Add null check for this.session
      this.session.play();
    }
    this.playbackState = 'loading';
    if (this.outputNode && this.audioContext) {
      this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    }
  }

  private stop() {
    if (this.session) { // Add null check for this.session
      this.session.stop();
    }
    this.playbackState = 'stopped';
    if (this.outputNode && this.audioContext) {
      this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    }
    this.nextStartTime = 0;
  }

  private async handleMainAudioButton() { // Renamed from handleTurnOnAudio / handlePlayPause
    if (!this.audioReady) {
      // First click: initialize audio context and start playback
      await this.connectToSession();
      await this.setSessionPrompts();
      this.play();
    } else {
      // Subsequent clicks: toggle play/pause
      if (this.playbackState === 'playing') {
        this.pause();
      } else if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
        if (this.connectionError) {
          await this.connectToSession(); // Reconnect if there was an error
          if (this.connectionError) { // If still error after reconnect, don't proceed to set prompts
            return;
          }
        }
        await this.setSessionPrompts();
        this.play();
      } else if (this.playbackState === 'loading') {
        this.stop();
      }
    }
  }

  private get isButtonOn() {
    return this.playbackState === 'playing' || this.playbackState === 'loading';
  }

  private renderAudioButtonContent() {
    return html`
      <div class="inner-circle"></div>
      ${this.isButtonOn
        ? html`<span class="status-text">ON</span>`
        : html`<span class="status-text">OFF</span>`}
    `;
  }

  private async toggleShowMidi() {
    this.showMidi = !this.showMidi;
    if (!this.showMidi) return;
    const inputIds = await this.midiDispatcher.getMidiAccess();
    this.midiInputIds = inputIds;
    this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }



  private saveApiKeyToLocalStorage() {
    if (this.geminiApiKey) {
      localStorage.setItem('geminiApiKey', this.geminiApiKey);
      this.toastMessage.show('Gemini API key saved to local storage.');
      // Do not hide the field here. Visibility is managed by connection status.
    } else {
      localStorage.removeItem('geminiApiKey');
      this.toastMessage.show('Gemini API key removed from local storage.');
    }
    // Trigger the power button as requested
    this.handleMainAudioButton();
  }

  private handleApiKeyInputChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.geminiApiKey = inputElement.value;
  }

  private getApiKey() {
    window.open('https://aistudio.google.com/apikey', '_blank');
  }
   private resetAll() {
     this.setPrompts(PromptDjMidi.buildDefaultPrompts());
   }

   private handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const { id, value, type } = target;

    if (type === 'checkbox') {
      const checkbox = target as HTMLInputElement;
      if (id === 'auto-density') {
        this.autoDensity = checkbox.checked;
        if (checkbox.checked) {
          this.config = { ...this.config, density: this.lastDefinedDensity };
        }
      } else if (id === 'auto-brightness') {
        this.autoBrightness = checkbox.checked;
        if (checkbox.checked) {
          this.config = { ...this.config, brightness: this.lastDefinedBrightness };
        }
      } else {
        this.config = { ...this.config, [id]: checkbox.checked };
      }
    } else if (type === 'range') {
      const numValue = parseFloat(value);
      if (id === 'density') {
        this.lastDefinedDensity = numValue;
        this.autoDensity = false;
      } else if (id === 'brightness') {
        this.lastDefinedBrightness = numValue;
        this.autoBrightness = false;
      }
      this.config = { ...this.config, [id]: numValue };
    } else if (type === 'number') {
      this.config = { ...this.config, [id]: value === '' ? null : parseFloat(value) };
    } else { // For select elements
      this.config = { ...this.config, [id]: value };
    }
    this.requestUpdate();
  }

 
   override render() {
     const bg = styleMap({
       backgroundImage: this.makeBackground(),
     });

    const advancedClasses = classMap({
      'advanced-settings-panel': true, // Added for the new panel styling
      'advanced-settings': true,       // Kept for existing content layout if any
      'visible': this.showAdvanced,    // For visibility and animation
    });

    const scaleMap = new Map<string, string>([
      ['Auto', 'SCALE_UNSPECIFIED'],
      ['C Major / A Minor', 'C_MAJOR_A_MINOR'],
      ['C# Major / A# Minor', 'D_FLAT_MAJOR_B_FLAT_MINOR'],
      ['D Major / B Minor', 'D_MAJOR_B_MINOR'],
      ['D# Major / C Minor', 'E_FLAT_MAJOR_C_MINOR'],
      ['E Major / C# Minor', 'E_MAJOR_D_FLAT_MINOR'],
      ['F Major / D Minor', 'F_MAJOR_D_MINOR'],
      ['F# Major / D# Minor', 'G_FLAT_MAJOR_E_FLAT_MINOR'],
      ['G Major / E Minor', 'G_MAJOR_E_MINOR'],
      ['G# Major / F Minor', 'A_FLAT_MAJOR_F_MINOR'],
      ['A Major / F# Minor', 'A_MAJOR_G_FLAT_MINOR'],
      ['A# Major / G Minor', 'B_FLAT_MAJOR_G_MINOR'],
      ['B Major / G# Minor', 'B_MAJOR_A_FLAT_MINOR'],
    ]);

    const cfg = this.config;


     return html`
       <div id="background" style=${bg}></div>
       <div id="buttons">
         <button
           @click=${this.toggleShowMidi}
           class=${this.showMidi ? 'active' : ''}
           >MIDI</button
         >
         ${this.showMidi ? html`
           <select
             @change=${this.handleMidiInputChange}
             .value=${this.activeMidiInputId || ''}>
             ${this.midiInputIds.length > 0
           ? this.midiInputIds.map(
             (id) =>
               html`<option value=${id}>
                       ${this.midiDispatcher.getDeviceName(id)}
                     </option>`,
           )
           : html`<option value="">No devices found</option>`}
           </select>
         ` : ''}
         ${this.connectionError || !this.geminiApiKey ? html`
           <div style="display: flex; gap: 5px;">
             <input
               type="password"
               placeholder="Gemini API Key"
               .value=${this.geminiApiKey || ''}
               @input=${this.handleApiKeyInputChange}
             />
             <button @click=${this.saveApiKeyToLocalStorage}>Save</button>
             <button @click=${this.getApiKey}>Get API Key</button>
           </div>
         ` : ''}
        <button
          @click=${() => this.showAdvanced = !this.showAdvanced}
          class=${this.showAdvanced ? 'active' : ''}
          >Advanced</button
        >
      </div>
      <div class=${advancedClasses}>
        <div class="setting">
          <label for="seed">Seed</label>
          <input
            type="number"
            id="seed"
            .value=${cfg.seed ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting">
          <label for="bpm">BPM</label>
          <input
            type="number"
            id="bpm"
            min="60"
            max="180"
            .value=${cfg.bpm ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting" auto=${this.autoDensity}>
          <label for="density">Density</label>
          <input
            type="range"
            id="density"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedDensity}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-density"
              .checked=${this.autoDensity}
              @input=${this.handleInputChange} />
            <label for="auto-density">Auto</label>
            <span>${(this.lastDefinedDensity ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting" auto=${this.autoBrightness}>
          <label for="brightness">Brightness</label>
          <input
            type="range"
            id="brightness"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedBrightness}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-brightness"
              .checked=${this.autoBrightness}
              @input=${this.handleInputChange} />
            <label for="auto-brightness">Auto</label>
            <span>${(this.lastDefinedBrightness ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting">
          <label for="scale">Scale</label>
          <select
            id="scale"
            .value=${cfg.scale || 'SCALE_UNSPECIFIED'}
            @change=${this.handleInputChange}>
            <option value="" disabled selected>Select Scale</option>
            ${[...scaleMap.entries()].map(
              ([displayName, enumValue]) =>
                html`<option value=${enumValue}>${displayName}</option>`,
            )}
          </select>
        </div>
        <div class="setting">
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteBass"
              .checked=${!!cfg.muteBass}
              @change=${this.handleInputChange} />
            <label for="muteBass" style="font-weight: normal;">Mute Bass</label>
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteDrums"
              .checked=${!!cfg.muteDrums}
              @change=${this.handleInputChange} />
            <label for="muteDrums" style="font-weight: normal;"
              >Mute Drums</label
            >
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="onlyBassAndDrums"
              .checked=${!!cfg.onlyBassAndDrums}
              @change=${this.handleInputChange} />
            <label for="onlyBassAndDrums" style="font-weight: normal;"
              >Only Bass & Drums</label
            >
          </div>
        </div>
      </div>
       <div id="grid">${this.renderPrompts()}</div>
       <button id="main-audio-button" @click=${this.handleMainAudioButton} class="${this.isButtonOn ? 'is-on' : 'is-off'}">
         ${this.renderAudioButtonContent()}
       </button>
       <toast-message></toast-message>
     `;
   }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }

  static getInitialPrompts(): Map<string, Prompt> {
    const { localStorage } = window;
    const storedPrompts = localStorage.getItem('prompts');

    if (storedPrompts) {
      try {
        const prompts = JSON.parse(storedPrompts) as Prompt[];
        console.log('Loading stored prompts', prompts);
        return new Map(prompts.map((prompt) => [prompt.promptId, prompt]));
      } catch (e) {
        console.error('Failed to parse stored prompts', e);
      }
    }

    console.log('No stored prompts, using default prompts');

    return PromptDjMidi.buildDefaultPrompts();
  }

  static buildDefaultPrompts() {
    // Construct default prompts
    // Pick 3 random prompts to start with weight 1
    const startOn = [...DEFAULT_PROMPTS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const prompts = new Map<string, Prompt>();

    for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
      const promptId = `prompt-${i}`;
      const prompt = DEFAULT_PROMPTS[i];
      const { text, color } = prompt;
      prompts.set(promptId, {
        promptId,
        text,
        weight: startOn.includes(prompt) ? 1 : 0,
        cc: i,
        color,
      });
    }

    return prompts;
  }

  static setStoredPrompts(prompts: Map<string, Prompt>) {
    const storedPrompts = JSON.stringify([...prompts.values()]);
    const { localStorage } = window;
    localStorage.setItem('prompts', storedPrompts);
  }
}

function main(parent: HTMLElement) {
  const midiDispatcher = new MidiDispatcher();
  const initialPrompts = PromptDjMidi.getInitialPrompts();
  const pdjMidi = new PromptDjMidi(
    initialPrompts,
    midiDispatcher,
  );
  parent.appendChild(pdjMidi);
}

main(document.body);

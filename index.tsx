/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, LitElement, svg } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage } from '@google/genai';

import { decode, decodeAudioData } from './utils/audio'
import { throttle } from './utils/throttle'
import { AudioAnalyser } from './utils/AudioAnalyser';
import { MidiDispatcher } from './utils/MidiDispatcher';

import './components/WeightKnob';
import './components/PromptController';
import { ToastMessage } from './components/ToastMessage'; // Removed PlayPauseButton import

import type { Prompt, PlaybackState } from './types';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY, apiVersion: 'v1alpha' });
const model = 'lyria-realtime-exp';

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
    #main-audio-button { /* Renamed from #turn-on-audio-button */
      width: 15vmin; /* Match play-pause-button size */
      height: 15vmin; /* Make it a circle */
      border-radius: 50%; /* Make it circular */
      background: linear-gradient(145deg, #4CAF50, #388E3C); /* Green gradient */
      color: white;
      border: none;
      box-shadow: 5px 5px 10px rgba(0,0,0,0.3), -5px -5px 10px rgba(255,255,255,0.1); /* Inner and outer shadow */
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex; /* To center the icon */
      justify-content: center;
      align-items: center;
      font-size: 0; /* Hide text, use icon */
      position: absolute; /* Position in upper right corner */
      top: 2.5vmin; /* Adjust as needed */
      right: 2.5vmin; /* Adjust as needed */
    }
    #main-audio-button:hover {
      background: linear-gradient(145deg, #4CAF50, #388E3C); /* Keep same gradient on hover for consistency */
      box-shadow: inset 2px 2px 5px rgba(0,0,0,0.5), inset -2px -2px 5px rgba(255,255,255,0.2); /* Inset shadow on hover for pressed effect */
    }
    #main-audio-button svg {
        width: 60%; /* Size the icon */
        height: 60%;
        fill: white;
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

  @property({ type: Boolean }) private showMidi = false;
  @state() private audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @state()
  private filteredPrompts = new Set<string>();

  private audioLevelRafId: number | null = null;
  private connectionError = true;

  @query('toast-message') private toastMessage!: ToastMessage; // Removed playPauseButton query

  constructor(
    prompts: Map<string, Prompt>,
    midiDispatcher: MidiDispatcher,
  ) {
    super();
    this.prompts = prompts;
    this.midiDispatcher = midiDispatcher;
    this.updateAudioLevel = this.updateAudioLevel.bind(this);
  }

  override async firstUpdated() {
    // Ensure toastMessage is ready before connecting to session
    await customElements.whenDefined('toast-message');
  }

  private async connectToSession() {
    this.session = await ai.live.music.connect({
      model: model,
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
          this.connectToSession(); // Reconnect if there was an error
          this.setSessionPrompts();
        }
        this.play();
      } else if (this.playbackState === 'loading') {
        this.stop();
      }
    }
  }

  private renderAudioButtonIcon() {
    if (this.playbackState === 'playing') {
      return svg`<path
        d="M75.0037 69V39H83.7537V69H75.0037ZM56.2537 69V39H65.0037V69H56.2537Z"
        fill="#FEFEFE"
      />`;
    } else if (this.playbackState === 'loading') {
      return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
              l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
    } else {
      return svg`<path d="M60 71.5V36.5L87.5 54L60 71.5Z" fill="#FEFEFE" />`;
    }
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

  private resetAll() {
    this.setPrompts(buildDefaultPrompts());
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
      </div>
      <div id="grid">${this.renderPrompts()}</div>
      <button id="main-audio-button" @click=${this.handleMainAudioButton}>
        <svg width="140" height="140" viewBox="0 -10 140 150" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="22" y="6" width="96" height="96" rx="48" fill="black" fill-opacity="0.05" />
          <rect x="23.5" y="7.5" width="93" height="93" rx="46.5" stroke="black" stroke-opacity="0.3" stroke-width="3" />
          <g filter="url(#filter0_ddi_1048_7373)">
            <rect x="25" y="9" width="90" height="90" rx="45" fill="white" fill-opacity="0.05" shape-rendering="crispEdges" />
          </g>
          ${this.renderAudioButtonIcon()}
          <defs>
            <filter id="filter0_ddi_1048_7373" x="0" y="0" width="140" height="140" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
              <feFlood flood-opacity="0" result="BackgroundImageFix" />
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
              <feOffset dy="2" />
              <feGaussianBlur stdDeviation="4" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
              <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1048_7373" />
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
              <feOffset dy="16" />
              <feGaussianBlur stdDeviation="12.5" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
              <feBlend mode="normal" in2="effect1_dropShadow_1048_7373" result="effect2_dropShadow_1048_7373" />
              <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_1048_7373" result="shape" />
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
              <feOffset dy="3" />
              <feGaussianBlur stdDeviation="1.5" />
              <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
              <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0" />
              <feBlend mode="normal" in2="shape" result="effect3_innerShadow_1048_7373" />
            </filter>
          </defs>
        </svg>
      </button>
      <toast-message></toast-message>`;
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
}

function main(parent: HTMLElement) {
  const midiDispatcher = new MidiDispatcher();
  const initialPrompts = getInitialPrompts();
  const pdjMidi = new PromptDjMidi(
    initialPrompts,
    midiDispatcher,
  );
  parent.appendChild(pdjMidi);
}

function getInitialPrompts(): Map<string, Prompt> {
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

  return buildDefaultPrompts();
}

function buildDefaultPrompts() {
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

function setStoredPrompts(prompts: Map<string, Prompt>) {
  const storedPrompts = JSON.stringify([...prompts.values()]);
  const { localStorage } = window;
  localStorage.setItem('prompts', storedPrompts);
}

main(document.body);

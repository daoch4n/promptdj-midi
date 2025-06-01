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
import type { WeightKnob } from './components/WeightKnob';
import './components/DJStyleSelector';
import type { DJStyleSelectorOption } from './components/DJStyleSelector';
import './components/PlayPauseButton';

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
  // Inside PromptDjMidi class
  private static readonly INITIAL_CONFIG = {
    seed: null as number | null,
    bpm: null as number | null, // Consistent with autoBpm=true initially setting config.bpm to null
    density: 0.5,
    brightness: 0.5,
    scale: 'SCALE_UNSPECIFIED',
    muteBass: false,
    muteDrums: false,
    onlyBassAndDrums: false,
    temperature: 1.1,
    topK: 40,
    guidance: 4.0
  };

  private static readonly INITIAL_AUTO_STATES = {
    autoDensity: true,
    autoBrightness: true,
    autoBpm: true
  };

  private static readonly INITIAL_LAST_DEFINED_STATES = {
    lastDefinedDensity: 0.5,
    lastDefinedBrightness: 0.5,
    lastDefinedBpm: 120
  };

  static override styles = css`
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      overflow:hidden;
    }
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #main-content-area {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: center;
      gap: 5vmin;
      width: 100%;
      max-width: 1600px;
      height: 100%;
      padding: 8vmin 5vmin;
      padding-right: 240px; /* Added for fixed panel */
      box-sizing: border-box;
    }
    .advanced-settings-panel {
      font-family: 'DS-Digital', cursive;
      position: fixed;
      right: 0;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      width: 240px;
      z-index: 1000;
      background-color: #202020;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      color: #fff;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      padding: 20px;
      padding-top: 20px;
      box-sizing: border-box;
    }
    .advanced-settings-panel .setting {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      margin-bottom: 15px;
      }
    .advanced-settings-panel .setting > label:first-child {
        margin-bottom: 8px;
        font-weight: bold;
        text-align: center;
        color: #fff; /* Ensure labels are white */
    }
    .advanced-settings-panel .setting > label .label-value {
      font-weight: normal; /* Labels are bold, so values can be normal */
      color: #dddddd;     /* Slightly lighter or different color for the value */
      margin-left: 8px;  /* Space between label text and value */
    }

    .advanced-settings-panel .setting weight-knob {
      width: 100px;
      margin: 0 auto; /* Center the knob if its container is wider */
    }
 
   .advanced-settings-panel .setting .auto-row,
   .advanced-settings-panel .setting .checkbox-setting {
     display: flex; align-items: center; justify-content: flex-start;
     margin-top: 8px; padding: 0 5%;
   }
    .advanced-settings-panel .setting .option-button {
      background-color: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
      font-size: 0.9em;
      margin-top: 5px; /* Added to provide some space from the label */
    }
    .advanced-settings-panel .setting .option-button:hover {
      background-color: #444;
    }
    .advanced-settings-panel .setting .option-button.selected {
      background-color: #888888;
      box-shadow: 0 0 4px #888888, 0 0 6px #888888;
      color: #fff;
      font-weight: bold;
    }

    /* Add these rules within the static styles */
   #grid {
     width: 80vmin;
     height: 80vmin;
     display: grid;
     grid-template-columns: repeat(4, 1fr);
     gap: 2.5vmin;
     margin-top: 0;
   }
 
   #background {
     will-change: background-image;
     position: absolute;
     height: 100%;
     width: 100%;
     z-index: -1;
     background: #111;
   }
   prompt-controller {
     width: 100%;
   }
   #buttons {
     position: absolute;
     top: 0;
     left: 0;
     padding: 10px;
     display: flex;
     gap: 5px;
     align-items: center;
   }
   #buttons button {
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
   }
    #buttons button.active {
        background-color: #fff;
        color: #000;
    }
    #buttons select {
       font: inherit;
       padding: 5px;
       background: #fff;
       color: #000;
       border-radius: 4px;
       border: none;
       outline: none;
       cursor: pointer;
     }
    #buttons .api-controls, #buttons .seed-controls {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    #buttons .seed-controls label {
        font-weight: 600;
        color: #fff;
    }
    #buttons input {
        font-family: 'DS-Digital', cursive;
        background: #0002;
        border: 1.5px solid #fff;
        color: #fff;
        border-radius: 4px;
        font-size: 1rem;
        padding: 3px 6px;
    }
    #buttons input[type="text"] {
        width: 18vmin; /* Approximately matches prompt input width */
    }
    #buttons input[type="number"] {
        width: 18vmin;
    }

    play-pause-button {
      width: 100px;
      height: 100px;
      margin: 0 auto 15px auto; /* top right&left bottom */
      display: block;
      cursor: pointer;
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
 
   @state() private config = { ...PromptDjMidi.INITIAL_CONFIG };
   @state() private lastDefinedDensity = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedDensity;
   @state() private autoDensity = PromptDjMidi.INITIAL_AUTO_STATES.autoDensity;
   @state() private lastDefinedBrightness = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBrightness;
   @state() private autoBrightness = PromptDjMidi.INITIAL_AUTO_STATES.autoBrightness;
   @state() private lastDefinedBpm = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBpm;
   @state() private autoBpm = PromptDjMidi.INITIAL_AUTO_STATES.autoBpm;

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
 
     if (this.geminiApiKey) {
       this.ai = new GoogleGenAI({ apiKey: this.geminiApiKey, apiVersion: 'v1alpha' });
     }
   }
 
   override async firstUpdated() {
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
             if (this.toastMessage && typeof this.toastMessage.show === 'function') {
               this.toastMessage.show('Connection lost. Attempting to reconnect...');
             }
             this.connectToSession();
           },
           onclose: (e: CloseEvent) => {
             this.connectionError = true;
             if (this.toastMessage && typeof this.toastMessage.show === 'function') {
               this.toastMessage.show('Connection lost. Attempting to reconnect...');
             }
             this.connectToSession();
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
       if (this.session) {
         await this.session.setWeightedPrompts({
           weightedPrompts: promptsToSend,
         });
       }
     } catch (e: unknown) {
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
     30,
   );
 
   private pause() {
     if (this.session) {
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
       this.updateAudioLevel();
     }
 
     this.audioContext.resume();
     this.audioReady = true;
     if (this.session) {
       this.session.play();
     }
     this.playbackState = 'loading';
     if (this.outputNode && this.audioContext) {
       this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
       this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
     }
   }
 
   private stop() {
     if (this.session) {
       this.session.stop();
     }
     this.playbackState = 'stopped';
     if (this.outputNode && this.audioContext) {
       this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
       this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
     }
     this.nextStartTime = 0;
   }
 
   private async handleMainAudioButton() {
     if (!this.audioReady) {
       await this.connectToSession();
       await this.setSessionPrompts();
       this.play();
     } else {
       if (this.playbackState === 'playing') {
         this.pause();
       } else if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
         if (this.connectionError) {
           await this.connectToSession();
           if (this.connectionError) {
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
     } else {
       localStorage.removeItem('geminiApiKey');
       this.toastMessage.show('Gemini API key removed from local storage.');
     }
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
      // Reset config properties
      this.config = { ...PromptDjMidi.INITIAL_CONFIG };

      // Reset auto states
      this.autoDensity = PromptDjMidi.INITIAL_AUTO_STATES.autoDensity;
      this.autoBrightness = PromptDjMidi.INITIAL_AUTO_STATES.autoBrightness;
      this.autoBpm = PromptDjMidi.INITIAL_AUTO_STATES.autoBpm;

      // Reset last defined states
      this.lastDefinedDensity = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedDensity;
      this.lastDefinedBrightness = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBrightness;
      this.lastDefinedBpm = PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBpm;

      // Reset prompts
      this.setPrompts(PromptDjMidi.buildDefaultPrompts());

      // Request UI update
      this.requestUpdate(); // Important to reflect changes in UI

      // Send reset parameters to session
      this._sendPlaybackParametersToSession();
    }

    private _sendPlaybackParametersToSession() {
      if (this.session) {
        this.session.updatePlaybackParameters({
          density: this.config.density,
          brightness: this.config.brightness,
          bpm: this.config.bpm,
          muteBass: this.config.muteBass,
          muteDrums: this.config.muteDrums,
          onlyBassAndDrums: this.config.onlyBassAndDrums,
          scale: this.config.scale === 'SCALE_UNSPECIFIED' ? null : this.config.scale,
          temperature: this.config.temperature,
          topK: this.config.topK,
          guidance: this.config.guidance,
          // Include seed if it's managed and sent this way
          seed: this.config.seed,
        });
      }
    }

    private handleToggleClick(event: Event) {
      const target = event.currentTarget as HTMLElement;
      const id = target.id as 'muteBass' | 'muteDrums' | 'onlyBassAndDrums';

      if (id === 'muteBass' || id === 'muteDrums' || id === 'onlyBassAndDrums') {
        this.config = { ...this.config, [id]: !this.config[id] };
        this.requestUpdate();
        this._sendPlaybackParametersToSession(); // Replace previous session call
      }
    }

    private handleAutoToggleClick(event: Event) {
      const target = event.currentTarget as HTMLElement;
      const id = target.id as 'auto-density' | 'auto-brightness' | 'auto-bpm';
      let newDensity = this.config.density;
      let newBrightness = this.config.brightness;
      let newBpm = this.config.bpm;

      switch (id) {
        case 'auto-density':
          this.autoDensity = !this.autoDensity;
          if (!this.autoDensity) { // Switched to Manual
            newDensity = this.lastDefinedDensity;
          } else { // Switched to Auto
            newDensity = 0.5; // Default auto value for density (0-1 scale)
          }
          // Update config only if it changed to avoid redundant updates if already 0.5
          if (this.config.density !== newDensity) {
            this.config = { ...this.config, density: newDensity };
          }
          break;
        case 'auto-brightness':
          this.autoBrightness = !this.autoBrightness;
          if (!this.autoBrightness) { // Switched to Manual
            newBrightness = this.lastDefinedBrightness;
          } else { // Switched to Auto
            newBrightness = 0.5; // Default auto value for brightness (0-1 scale)
          }
          if (this.config.brightness !== newBrightness) {
            this.config = { ...this.config, brightness: newBrightness };
          }
          break;
        case 'auto-bpm':
          this.autoBpm = !this.autoBpm;
          if (!this.autoBpm) { // Switched to Manual
            newBpm = this.lastDefinedBpm;
          } else { // Switched to Auto
            // For BPM, null is used to signify auto to the backend in updatePlaybackParameters.
            // Or, if a default BPM is preferred for config, set it here (e.g., 120).
            // Let's use null in config as well for consistency with what might be sent.
            newBpm = null;
          }
          if (this.config.bpm !== newBpm) {
            this.config = { ...this.config, bpm: newBpm };
          }
          break;
      }
      this.requestUpdate();
      this._sendPlaybackParametersToSession(); // Replace previous session call
    }
 
    private handleInputChange(event: Event) {
     const target = event.target as HTMLInputElement | HTMLSelectElement | WeightKnob;
     const id = target.id;
 
     if (target instanceof HTMLInputElement && target.type === 'checkbox') {
       const isChecked = target.checked;
       if (id === 'auto-density') {
         this.autoDensity = isChecked;
       } else if (id === 'auto-brightness') {
         this.autoBrightness = isChecked;
       } else if (id === 'auto-bpm') {
         this.autoBpm = isChecked;
       } else {
         this.config = { ...this.config, [id]: isChecked };
       }
     } else if (target.tagName === 'WEIGHT-KNOB') {
        const knob = target as WeightKnob;
        const knobValue = knob.value; // This is the 0-2 value
        if (id === 'density') {
            this.lastDefinedDensity = knobValue / 2; // 0-1 scale
            this.autoDensity = false;
            this.config = { ...this.config, density: this.lastDefinedDensity };
        } else if (id === 'brightness') {
            this.lastDefinedBrightness = knobValue / 2; // 0-1 scale
            this.autoBrightness = false;
            this.config = { ...this.config, brightness: this.lastDefinedBrightness };
        } else if (id === 'bpm') {
            const minBpm = 60;
            const maxBpm = 180;
            const newBpm = Math.round((knobValue / 2) * (maxBpm - minBpm) + minBpm);
            this.lastDefinedBpm = newBpm;
            this.autoBpm = false;
            this.config = { ...this.config, bpm: newBpm };
        } else if (id === 'temperature') {
            const minTemp = 0;
            const maxTemp = 3;
            const newTemp = parseFloat(((knobValue / 2) * (maxTemp - minTemp) + minTemp).toFixed(1)); // Keep one decimal
            this.config = { ...this.config, temperature: newTemp };
        } else if (id === 'topK') {
            const minTopK = 1;
            const maxTopK = 100;
            const newTopK = Math.round((knobValue / 2) * (maxTopK - minTopK) + minTopK);
            this.config = { ...this.config, topK: newTopK };
        } else if (id === 'guidance') {
            const minGuidance = 0;
            const maxGuidance = 6;
            const newGuidance = parseFloat(((knobValue / 2) * (maxGuidance - minGuidance) + minGuidance).toFixed(1)); // Keep one decimal
            this.config = { ...this.config, guidance: newGuidance };
        }
        this._sendPlaybackParametersToSession(); // Add this call
     } else if (target instanceof HTMLInputElement && target.type === 'number') {
        const value = (target as HTMLInputElement).value;
        this.config = { ...this.config, [id]: value === '' ? null : parseFloat(value) };
        this._sendPlaybackParametersToSession(); // Also call for direct number inputs like seed
     } else if (event instanceof CustomEvent && event.detail !== undefined) { // For DJStyleSelector
        const value = event.detail;
        this.config = { ...this.config, [id]: value };
        this._sendPlaybackParametersToSession(); // Also call for DJStyleSelector (scale)
     } else { // For standard HTMLSelectElement
        const value = (target as HTMLSelectElement).value;
        this.config = { ...this.config, [id]: value };
        // Note: This branch is not currently used by any standard select, but if it were,
        // it would also need: this._sendPlaybackParametersToSession();
     }
     this.requestUpdate();
   }
 
  
    override render() {
       const bg = styleMap({
         backgroundImage: this.makeBackground(),
       });
 
     const advancedClasses = classMap({
       'advanced-settings-panel': true,
     });
 
     const scaleMap = new Map<string, { value: string, color: string }>([
       ['Auto', { value: 'SCALE_UNSPECIFIED', color: '#888888' }],
       ['C Major / A Minor', { value: 'C_MAJOR_A_MINOR', color: '#FF6F61' }], // Coral
       ['C# Major / A# Minor', { value: 'D_FLAT_MAJOR_B_FLAT_MINOR', color: '#6B5B95' }], // Amethyst
       ['D Major / B Minor', { value: 'D_MAJOR_B_MINOR', color: '#88B04B' }], // Pistachio
       ['D# Major / C Minor', { value: 'E_FLAT_MAJOR_C_MINOR', color: '#F7CAC9' }], // Rose Quartz
       ['E Major / C# Minor', { value: 'E_MAJOR_D_FLAT_MINOR', color: '#92A8CD' }], // Periwinkle
       ['F Major / D Minor', { value: 'F_MAJOR_D_MINOR', color: '#F4B393' }], // Peach
       ['F# Major / D# Minor', { value: 'G_FLAT_MAJOR_E_FLAT_MINOR', color: '#CCEEFF' }], // Sky Blue
       ['G Major / E Minor', { value: 'G_MAJOR_E_MINOR', color: '#DA2C38' }], // Crimson
       ['G# Major / F Minor', { value: 'A_FLAT_MAJOR_F_MINOR', color: '#FFD700' }], // Gold
       ['A Major / F# Minor', { value: 'A_MAJOR_G_FLAT_MINOR', color: '#40E0D0' }], // Turquoise
       ['A# Major / G Minor', { value: 'B_FLAT_MAJOR_G_MINOR', color: '#9966CC' }], // Lavender
       ['B Major / G# Minor', { value: 'B_MAJOR_A_FLAT_MINOR', color: '#FFBF00' }], // Amber
     ]);
 
     const cfg = this.config;
 
     const djStyleSelectorOptions = Array.from(scaleMap, ([label, { value, color }]) => ({ label, value, color } as DJStyleSelectorOption));

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
            <button @click=${this.getApiKey}>Get API Key</button>
            <div class="api-controls">
              <input
                type="text"
                placeholder="Gemini API Key"
                .value=${this.geminiApiKey || ''}
                @input=${this.handleApiKeyInputChange}
              />
              <button @click=${this.saveApiKeyToLocalStorage}>Save</button>
            </div>
            <div class="seed-controls">
                <label for="seed">Seed</label>
                <input
                    type="number"
                    id="seed"
                    .value=${cfg.seed ?? ''}
                    @input=${this.handleInputChange}
                    placeholder="Auto" />
            </div>
          ` : ''}
        </div>
        <div id="main-content-area">
${this.renderPrompts()}
        </div>
<div class=${advancedClasses}>
          <play-pause-button
            .playbackState=${this.playbackState}
            @play-pause-click=${this.handleMainAudioButton}
          ></play-pause-button>
          <div class="setting">
            <label for="density">Density: <span class="label-value">${(this.config.density ?? 0.5).toFixed(2)}</span></label>
            <weight-knob
              id="density"
              .value=${this.autoDensity ? 1 : cfg.density * 2}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-density"
              class="option-button ${this.autoDensity ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <div class="setting">
            <label for="brightness">Brightness: <span class="label-value">${(this.config.brightness ?? 0.5).toFixed(2)}</span></label>
            <weight-knob
              id="brightness"
              .value=${this.autoBrightness ? 1 : cfg.brightness * 2}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-brightness"
              class="option-button ${this.autoBrightness ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <div class="setting">
            <label for="bpm">BPM: <span class="label-value">${this.autoBpm ? 'AUTO' : (this.config.bpm ?? 120).toFixed(0)}</span></label>
            <weight-knob
              id="bpm"
              .value=${this.autoBpm ? 1 : ((cfg.bpm ?? 120) - 60) / (180 - 60) * 2}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-bpm"
              class="option-button ${this.autoBpm ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <div class="setting">
            <label for="scale">Scale</label>
            <dj-style-selector
              id="scale"
              .options=${djStyleSelectorOptions}
              .value=${cfg.scale}
              @change=${this.handleInputChange}
            ></dj-style-selector>
          </div>
          <div class="setting">
            <label for="temperature">Temperature: <span class="label-value">${(this.config.temperature ?? 1.1).toFixed(1)}</span></label>
            <weight-knob
              id="temperature"
              .value=${( (this.config.temperature ?? 1.1) - 0) / (3 - 0) * 2 }
              .displayValue=${(this.config.temperature ?? 1.1).toFixed(1)}
              @input=${this.handleInputChange}
            ></weight-knob>
          </div>
          <div class="setting">
            <label for="topK">Top K: <span class="label-value">${(this.config.topK ?? 40).toFixed(0)}</span></label>
            <weight-knob
              id="topK"
              .value=${( (this.config.topK ?? 40) - 1) / (100 - 1) * 2 }
              .displayValue=${(this.config.topK ?? 40).toFixed(0)}
              @input=${this.handleInputChange}
            ></weight-knob>
          </div>
          <div class="setting">
            <label for="guidance">Guidance: <span class="label-value">${(this.config.guidance ?? 4.0).toFixed(1)}</span></label>
            <weight-knob
              id="guidance"
              .value=${( (this.config.guidance ?? 4.0) - 0) / (6 - 0) * 2 }
              .displayValue=${(this.config.guidance ?? 4.0).toFixed(1)}
              @input=${this.handleInputChange}
            ></weight-knob>
          </div>
          <div class="setting">
            <label>Mute Bass</label>
            <div
              id="muteBass"
              class="option-button ${this.config.muteBass ? 'selected' : ''}"
              @click=${this.handleToggleClick}
            >
              Mute Bass
            </div>
          </div>
          <div class="setting">
            <label>Mute Drums</label>
            <div
              id="muteDrums"
              class="option-button ${this.config.muteDrums ? 'selected' : ''}"
              @click=${this.handleToggleClick}
            >
              Mute Drums
            </div>
          </div>
          <div class="setting">
            <label>Only Bass & Drums</label>
            <div
              id="onlyBassAndDrums"
              class="option-button ${this.config.onlyBassAndDrums ? 'selected' : ''}"
              @click=${this.handleToggleClick}
            >
              Only Bass & Drums
            </div>
          </div>
          <div class="setting">
            <div
              id="reset-button"
              class="option-button"
              @click=${this.resetAll}
            >
              Reset
            </div>
          </div>
        </div>
      `;
    }

    private renderPrompts() {
  return html`<div id="grid">
    ${[...this.prompts.values()].map((prompt) => {
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
    })}
  </div>`;
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

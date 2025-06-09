import OpusMediaRecorder from '@dmk-dark/opus-media-recorder-fork';
import oggOpusEncoderWasmPath from '@dmk-dark/opus-media-recorder-fork/OggOpusEncoder.wasm?url';
import webMOpusEncoderWasmPath from '@dmk-dark/opus-media-recorder-fork/WebMOpusEncoder.wasm?url';
// Attempting Vite-idiomatic asset handling for opus-media-recorder
// These paths assume opus-media-recorder's assets are in its 'dist' folder.
// If 'dist' is not present or files are elsewhere, these paths will need adjustment.
import encoderWorkerPath from '@dmk-dark/opus-media-recorder-fork/encoderWorker.umd.js?url';
import {
  GoogleGenAI,
  type LiveMusicServerMessage,
  type LiveMusicSession,
  type Scale,
} from '@google/genai';
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { AudioAnalyser } from './utils/AudioAnalyser';
import { MidiDispatcher } from './utils/MidiDispatcher';
import { decode, decodeAudioData } from './utils/audio';
import { throttle } from './utils/throttle';

import './components/WeightKnob';
import './components/PromptController';
import type { WeightKnob } from './components/WeightKnob';
import './components/DJStyleSelector';
import type { DJStyleSelectorOption } from './components/DJStyleSelector';
import './components/PlayPauseButton';
import './components/RecordButton.js'; // Import RecordButton
import './components/DSPOverloadIndicator.js';

import type { PlaybackState, Prompt } from './types';

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
  { color: '#ff25f6', text: 'Bitpop' },
  { color: '#d8ff3e', text: 'Neo Soul' },
  { color: '#5200ff', text: 'Trip Hop' },
  { color: '#d9b2ff', text: 'Thrash' },
  { color: '#FF69B4', text: 'Psychedelic Rock' },
  { color: '#FFA500', text: 'Lo-fi Hip Hop' },
  { color: '#00CED1', text: 'House' },
  { color: '#8A2BE2', text: 'Techno' },
  { color: '#20B2AA', text: 'Ambient' },
  { color: '#FFD700', text: 'Reggae' },
  { color: '#00FA9A', text: 'Electro' },
  { color: '#32CD32', text: 'Folk' },
  { color: '#DA70D6', text: 'Ethereal Vibes' },
  { color: '#778899', text: 'Vaporwave' },
  { color: '#1E90FF', text: 'Surf Rock' },
  { color: '#A9A9A9', text: 'Industrial' },
  { color: '#D2B48C', text: 'Disco' },
  { color: '#ff00cc', text: 'Synthwave' },
  { color: '#00ffff', text: 'Trance' },
  { color: '#00BFFF', text: 'Nu Jazz' },
];

// OpusMediaRecorder options
const opusWorkerOptions = {
  encoderWorkerFactory: () => new Worker(encoderWorkerPath), // Omitting { type: 'module' } for broader compatibility
  OggOpusEncoderWasmPath: oggOpusEncoderWasmPath,
  WebMOpusEncoderWasmPath: webMOpusEncoderWasmPath,
};
let isOpusPolyfillActive = false;

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  // Inside PromptDjMidi class
  private static readonly INITIAL_CONFIG = {
    seed: null as number | null,
    bpm: null as number | null,
    density: 0.5,
    brightness: 0.5,
    scale: 'SCALE_UNSPECIFIED',
    muteBass: false,
    muteDrums: false,
    onlyBassAndDrums: false,
    temperature: 1.1,
    topK: 40,
    guidance: 4.0,
  };

  private static readonly INITIAL_AUTO_STATES = {
    autoDensity: true,
    autoBrightness: true,
    autoBpm: true,
    autoTemperature: true,
    autoTopK: true,
    autoGuidance: true,
  };

  private static readonly INITIAL_LAST_DEFINED_STATES = {
    lastDefinedDensity: 0.5,
    lastDefinedBrightness: 0.5,
    lastDefinedBpm: 120,
    lastDefinedTemperature: 1.1,
    lastDefinedTopK: 40,
    lastDefinedGuidance: 4.0,
  };

  private static readonly BG_WEIGHT_SMOOTHING_FACTOR = 0.1;
  private static readonly MIN_FLOW_FREQUENCY_HZ = 0.01;
  private static readonly MAX_FLOW_FREQUENCY_HZ = 20.0;

  private static readonly KNOB_CONFIGS = {
    density: {
      defaultValue: PromptDjMidi.INITIAL_CONFIG.density,
      min: 0,
      max: 1,
      autoProperty: 'autoDensity',
      lastDefinedProperty: 'lastDefinedDensity',
    },
    brightness: {
      defaultValue: PromptDjMidi.INITIAL_CONFIG.brightness,
      min: 0,
      max: 1,
      autoProperty: 'autoBrightness',
      lastDefinedProperty: 'lastDefinedBrightness',
    },
    temperature: {
      defaultValue: PromptDjMidi.INITIAL_CONFIG.temperature,
      min: 0,
      max: 3,
      autoProperty: 'autoTemperature',
      lastDefinedProperty: 'lastDefinedTemperature',
    },
    topK: {
      defaultValue: PromptDjMidi.INITIAL_CONFIG.topK,
      min: 1,
      max: 100,
      autoProperty: 'autoTopK',
      lastDefinedProperty: 'lastDefinedTopK',
    },
    guidance: {
      defaultValue: PromptDjMidi.INITIAL_CONFIG.guidance,
      min: 0,
      max: 6,
      autoProperty: 'autoGuidance',
      lastDefinedProperty: 'lastDefinedGuidance',
    },
  };

  static override styles = css`
    @keyframes rgb-glow {
      0% {
        box-shadow: 0 0 4px #ff0000, 0 0 8px #ff0000;
        /* background-color: #4d0000; */ /* Darker Red */
      }
      17% {
        box-shadow: 0 0 4px #ff00ff, 0 0 8px #ff00ff;
        /* background-color: #4d004d; */ /* Darker Magenta */
      }
      33% {
        box-shadow: 0 0 4px #0000ff, 0 0 8px #0000ff;
        /* background-color: #00004d; */ /* Darker Blue */
      }
      50% {
        box-shadow: 0 0 4px #00ffff, 0 0 8px #00ffff;
        /* background-color: #004d4d; */ /* Darker Cyan */
      }
      67% {
        box-shadow: 0 0 4px #00ff00, 0 0 8px #00ff00;
        /* background-color: #004d00; */ /* Darker Green */
      }
      83% {
        box-shadow: 0 0 4px #ffff00, 0 0 8px #ffff00;
        /* background-color: #4d4d00; */ /* Darker Yellow */
      }
      100% {
        box-shadow: 0 0 4px #ff0000, 0 0 8px #ff0000;
        /* background-color: #4d0000; */ /* Darker Red */
      }
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
      padding: 8vmin 0 2.5vmin 2.5vmin;
      padding-right: 240px; 
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
        color: #fff; 
    }
    .advanced-settings-panel .setting > label .label-value {
      font-weight: normal; 
      color: #dddddd;     
      margin-left: 8px;  
    }

    .advanced-settings-panel .setting weight-knob {
      width: 100px;
      margin: 0 auto; 
    }
 
   .advanced-settings-panel .setting .auto-row,
   .advanced-settings-panel .setting .checkbox-setting {
     display: flex; align-items: center; justify-content: flex-start;
     margin-top: 8px; padding: 0 5%;
   }
    .advanced-settings-panel .setting .option-button {
      background-color: rgba(0, 0, 0, 0.4); /* Consistent black alpha */
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
      font-size: 0.9em;
      margin-top: 5px;
    }
    .advanced-settings-panel .setting .option-button:hover {
      background-color: rgba(0, 0, 0, 0.5); /* Slightly darker on hover */
      box-shadow: 0 0 5px -1px #007bff;
    }
    .advanced-settings-panel .setting .option-button.selected {
      background-color: rgba(0, 0, 0, 0.4); /* Consistent black alpha */
      border-color: #0056b3;
      color: #fff;
      font-weight: bold;
    }

    .advanced-settings-panel .setting .option-button[id^="auto-"].selected {
      color: #fff; 
      font-weight: bold; 
      animation: rgb-glow 40s linear infinite; 
      border: 1px solid transparent; 
    }

    dj-style-selector#scale .option.auto-scale-selected {
      color: #fff; 
      font-weight: bold; 
      text-shadow: 0px 0px 4px rgba(0,0,0,0.7), 0px 0px 1px rgba(0,0,0,0.9); 
      border: 1px solid transparent; 
      animation: rgb-glow 40s linear infinite; 
    }

   #grid {
     width: 100%;
     height: 100%;
     display: grid;
     grid-template-columns: repeat(8, 1fr);
     gap: 2.5vmin;
     margin-top: 0;
   }

    @media (max-width: 767px) {
      #grid {
        grid-template-columns: 1fr; 
        width: 50vw; 
        height: auto; 
        margin: 0 auto; 
      }
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
       color: #fff;
       background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
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
    #buttons .flow-parameters-group label {
        font-weight: 600;
        color: #fff !important; /* To ensure visibility over other potential styles */
    }
    #buttons input {
        font-family: 'DS-Digital', cursive;
        background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
        border: 1.5px solid #fff;
        color: #fff;
        border-radius: 4px;
        font-size: 1rem;
        padding: 3px 6px;
    }
    #buttons input[type="text"] {
        width: 18vmin;
    }
    #buttons input[type="number"] {
        width: 18vmin;
    }
    #buttons .seed-controls input#seed { /* This will be removed or repurposed if input is gone */
        width: 10vmin;
    }
    #buttons .seed-display-value {
      font-family: 'DS-Digital', cursive;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      border: 1.5px solid #fff;
      color: #fff;
      border-radius: 4px;
      font-size: 1rem;
      padding: 3px 6px;
      margin-left: 5px; /* Match label margin */
      min-width: 8ch; /* Ensure enough space for "Generating..." */
      display: inline-block; /* Allow padding and alignment */
      text-align: center;
    }
    #buttons dsp-overload-indicator {
      /* Copied from #buttons button and adjusted */
      font-weight: 600;
      cursor: default; /* It's an indicator, not a button */
      color: #fff;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      display: none; /* Original logic for appearing/disappearing */
      vertical-align: middle;
      height: auto;
      box-sizing: border-box;
    }
    /* Override display:none when it should be visible */
    #buttons dsp-overload-indicator.is-visible {
      display: inline-block;
    }
    #buttons .flow-parameters-group {
      display: flex;
      align-items: center;
      gap: 5px;
      /* margin-left: 5px; */ /* Retaining this commented out as per instruction */
    }
    #buttons .seed-controls button { /* General style for buttons in seed-controls */
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
    }
    #buttons .seed-controls button.active { /* Active state for Flow button */
      background-color: #fff;
      color: #000;
    }
    #buttons .flow-parameters-group label[for="flowFrequency"],
    #buttons .flow-parameters-group label[for="flowAmplitude"] {
      margin-left: 5px;
    }
    #buttons .seed-controls input#flowFrequency, /* This might be unused after changes */
    #buttons .seed-controls input#flowAmplitude {
      font-family: 'DS-Digital', cursive;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      border: 1.5px solid #fff;
      color: #fff;
      border-radius: 4px;
      font-size: 1rem;
      padding: 3px 6px;
      width: 10vmin;
    }
    .flow-control-button, .flow-direction-button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      margin-left: 5px;
    .flow-control-button {
      margin-left: 2px; /* Smaller margin for +/- buttons */
      padding: 1px 4px; /* Slightly smaller padding */
    }
    .flow-control-button.active, .flow-direction-button.active {
      background-color: #fff;
      color: #000;
    }

    play-pause-button {
      width: 100px;
      height: 100px;
      margin: 0 auto 15px auto; 
      display: block;
      cursor: pointer;
    }
    record-button { /* Style for the record button */
      display: block;
      margin: 15px auto 15px auto; /* top right bottom left - centers block element */
      width: 80px; /* Explicitly set width */
      height: 80px; /* Explicitly set height */
      cursor: pointer; /* Ensure cursor pointer is visible */
    }
   .solo-group-header {
     font-weight: bold;
     margin-top: 15px; 
     margin-bottom: 5px; 
     text-align: center; 
     color: #fff; 
   }
   .solo-button-group .setting {
     margin-bottom: 8px; 
   }
   #reset-button:hover {
     box-shadow: 0 0 8px #ff0000, 0 0 12px #ff0000; 
     border-color: #ff4444; 
   }
   `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private audioAnalyser: AudioAnalyser | null = null;

  @state() private playbackState: PlaybackState = 'stopped';
  @state() private audioReady = false;

  private session!: LiveMusicSession;
  private audioContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private readonly bufferTime = 2;

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
  @state() private lastDefinedDensity =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedDensity;
  @state() private autoDensity = PromptDjMidi.INITIAL_AUTO_STATES.autoDensity;
  @state() private lastDefinedBrightness =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBrightness;
  @state() private autoBrightness =
    PromptDjMidi.INITIAL_AUTO_STATES.autoBrightness;
  @state() private lastDefinedBpm =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBpm;
  @state() private autoBpm = PromptDjMidi.INITIAL_AUTO_STATES.autoBpm;
  @state() private lastDefinedTemperature =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTemperature;
  @state() private lastDefinedTopK =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTopK;
  @state() private lastDefinedGuidance =
    PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedGuidance;
  @state() private autoTemperature =
    PromptDjMidi.INITIAL_AUTO_STATES.autoTemperature;
  @state() private autoTopK = PromptDjMidi.INITIAL_AUTO_STATES.autoTopK;
  @state() private autoGuidance = PromptDjMidi.INITIAL_AUTO_STATES.autoGuidance;
  @state() private isSeedFlowing = false;
  @state() private flowFrequency = 1;
  @state() private flowAmplitude = 5;
  @state() private flowDirectionUp = true;
  @state() private flowDirectionDown = true;
  private globalFlowIntervalId: number | null = null;
  private freqAdjustIntervalId: number | null = null;
  private isFreqButtonPressed = false;
  private ampAdjustIntervalId: number | null = null;
  private isAmpButtonPressed = false;

  private static clamp01(v: number): number {
    return Math.min(Math.max(v, 0), 1);
  }

  private readonly ampStep = 1;
  private readonly MIN_AMP_VALUE = 1;
  private readonly MAX_AMP_VALUE = 100;

  @state() private apiKeyInvalid = false;

  @state() private apiKeySavedSuccessfully = false;
  @state() private promptWeightedAverage = 0;
  @state() private knobAverageExtremeness = 0;
  @state() private transientApiKeyStatusMessage: string | null = null;
  private apiKeyMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;
  @state() private showApiKeyControls = true;

  // Preset UI State
  @state() private presetNameToSave = '';
  @state() private availablePresets: string[] = [];
  @state() private selectedPreset = '';
  @state() private showPresetControls = false;

  // MediaRecorder state variables
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  @state() private isRecordingActive = false;
  private audioStream: MediaStream | null = null; // Will hold the stream from MediaStreamAudioDestinationNode
  private mediaStreamDestinationNode: MediaStreamAudioDestinationNode | null =
    null;

  private _bgWeightsAnimationId: number | null = null;
  private _animateBackgroundWeightsBound =
    this._animateBackgroundWeights.bind(this);
  private connectionError = true;
  private readonly maxRetries = 10;
  private currentRetryAttempt = 0;

  constructor(prompts: Map<string, Prompt>, midiDispatcher: MidiDispatcher) {
    super();
    prompts.forEach((prompt) => {
      if (prompt.isAutoFlowing === undefined) {
        prompt.isAutoFlowing = false;
      }
      if (prompt.activatedFromZero === undefined) {
        // Added this check
        prompt.activatedFromZero = false;
      }
      if (prompt.backgroundDisplayWeight === undefined) {
        prompt.backgroundDisplayWeight = prompt.weight;
      }
    });
    this.prompts = prompts;
    this.midiDispatcher = midiDispatcher;
    this.config.seed = Math.floor(Math.random() * 1000000) + 1;

    // Conditional MediaRecorder polyfill assignment
    if (
      !window.MediaRecorder ||
      !MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
    ) {
      console.log('Opus MediaRecorder polyfill activated for OGG.'); // Updated log message
      (window as any).MediaRecorder = OpusMediaRecorder; // Assign to window.MediaRecorder
      isOpusPolyfillActive = true;
    }

    this.updateAudioLevel = this.updateAudioLevel.bind(this);
    this.toggleSeedFlow = this.toggleSeedFlow.bind(this);
    this.handleFlowFrequencyChange = this.handleFlowFrequencyChange.bind(this);
    this.handleIncreaseFreq = this.handleIncreaseFreq.bind(this);
    this.handleDecreaseFreq = this.handleDecreaseFreq.bind(this);
    this.handleFlowAmplitudeChange = this.handleFlowAmplitudeChange.bind(this);
    this.toggleFlowDirection = this.toggleFlowDirection.bind(this);
    this.handlePromptAutoFlowToggled =
      this.handlePromptAutoFlowToggled.bind(this);
    this.globalFlowTick = this.globalFlowTick.bind(this);
    this._animateBackgroundWeightsBound =
      this._animateBackgroundWeights.bind(this);
    this.handleFreqButtonPress = this.handleFreqButtonPress.bind(this);
    this.handleFreqButtonRelease = this.handleFreqButtonRelease.bind(this);
    this.clearFreqAdjustInterval = this.clearFreqAdjustInterval.bind(this);
    this.handleAmpButtonPress = this.handleAmpButtonPress.bind(this);
    this.handleAmpButtonRelease = this.handleAmpButtonRelease.bind(this);
    this.clearAmpAdjustInterval = this.clearAmpAdjustInterval.bind(this);
    this.loadAvailablePresets(); // Load available presets

    if (typeof localStorage !== 'undefined') {
      this.geminiApiKey = localStorage.getItem('geminiApiKey');
    } else {
      this.geminiApiKey = null;
      console.warn(
        'localStorage is not available. Cannot load Gemini API key from localStorage.',
      );
    }

    if (this.geminiApiKey) {
      this.ai = new GoogleGenAI({
        apiKey: this.geminiApiKey,
        apiVersion: 'v1alpha',
      });
    }
    this.checkApiKeyStatus();
  }

  private isValidApiKeyFormat(apiKey: string): boolean {
    if (apiKey.startsWith('AIza') && apiKey.length === 39) {
      return true;
    }
    return false;
  }

  override async firstUpdated() {
    this.calculatePromptWeightedAverage();
    this.calculateKnobAverageExtremeness();
  }

  private async connectToSession() {
    await this.updateComplete;
    if (!this.geminiApiKey) {
      console.warn(
        'Please enter your Gemini API key to connect to the session.',
      );
      return;
    }

    if (!this.ai) {
      this.ai = new GoogleGenAI({
        apiKey: this.geminiApiKey,
        apiVersion: 'v1alpha',
      });
    }

    try {
      this.session = await this.ai.live.music.connect({
        model: this.model,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => {
            if (e.setupComplete) {
              this.connectionError = false;
              this.apiKeyInvalid = false;
              this.currentRetryAttempt = 0;
            }
            if (e.filteredPrompt) {
              this.filteredPrompts = new Set([
                ...this.filteredPrompts,
                e.filteredPrompt.text as string,
              ]);
              console.warn(
                'Filtered prompt reason:',
                e.filteredPrompt.filteredReason as string,
              );
            }
            if (e.serverContent?.audioChunks !== undefined) {
              if (
                this.playbackState === 'paused' ||
                this.playbackState === 'stopped'
              )
                return;
              if (!this.audioContext || !this.outputNode) {
                console.warn('Audio context not initialized. Please refresh.');
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
                this.nextStartTime =
                  this.audioContext.currentTime + this.bufferTime;
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
          onerror: () => this.handleConnectionIssue('Connection error'),
          onclose: (e: CloseEvent) =>
            this.handleConnectionIssue(`Connection closed (code: ${e.code})`),
        },
      });
    } catch (error) {
      this.connectionError = true;
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('authentication failed')
      ) {
        this.apiKeyInvalid = true;
      }
      this.stop();
      console.warn(
        'Failed to connect to session. Check your API key and network connection.',
      );
      console.error('Failed to connect to session:', error);
      this.currentRetryAttempt = 0;
    }
  }

  private async handleConnectionIssue(messagePrefix: string) {
    await this.updateComplete;
    this.connectionError = true;
    this.currentRetryAttempt++;

    if (this.currentRetryAttempt <= this.maxRetries) {
      this.playbackState = 'loading';
      console.warn(
        `${messagePrefix}. Attempting to reconnect (attempt ${this.currentRetryAttempt} of ${this.maxRetries})...`,
      );
      setTimeout(() => {
        this.connectToSession();
      }, 2000);
    } else {
      console.warn(
        'Failed to reconnect after multiple attempts. Please check your connection and try playing again.',
      );
      this.playbackState = 'stopped';
      this.currentRetryAttempt = 0;
    }
  }

  private getPromptsToSend() {
    return Array.from(this.prompts.values()).filter((p) => {
      return !this.filteredPrompts.has(p.text) && p.weight !== 0;
    });
  }

  private setSessionPrompts = throttle(async () => {
    await this.updateComplete;
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      console.warn('There needs to be one active prompt to play.');
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
        console.warn('Error setting session prompts:', e.message);
      } else {
        console.warn(
          'An unknown error occurred while setting session prompts.',
        );
      }
      this.pause();
    }
  }, 200);

  private updateAudioLevel() {
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

    if (prompt.isAutoFlowing) {
      prompt.isAutoFlowing = false;
      prompt.activatedFromZero = false; // Manual change overrides this state
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.setPrompts(newPrompts, false);
    this.calculatePromptWeightedAverage();
  }

  private setPrompts(
    newPrompts: Map<string, Prompt>,
    isProgrammaticJump = false,
  ) {
    this.prompts = newPrompts;

    for (const p of this.prompts.values()) {
      if (p.backgroundDisplayWeight === undefined) {
        p.backgroundDisplayWeight = p.weight;
      }
    }

    if (isProgrammaticJump) {
      this._startBackgroundWeightsAnimation();
    } else {
      for (const p of this.prompts.values()) {
        if (p.backgroundDisplayWeight !== p.weight) {
          p.backgroundDisplayWeight = p.weight;
        }
      }
      // if (changed) { // No specific action if only snapping
      // }
    }

    this.requestUpdate();
    this.dispatchPromptsChange();
    this.calculatePromptWeightedAverage();
  }

  private _animateBackgroundWeights(): void {
    let animationStillNeeded = false;
    let changedInThisFrame = false;

    for (const prompt of this.prompts.values()) {
      if (prompt.backgroundDisplayWeight === undefined) {
        prompt.backgroundDisplayWeight = prompt.weight;
      }

      const diff = prompt.weight - prompt.backgroundDisplayWeight;

      if (Math.abs(diff) < 0.001) {
        if (prompt.backgroundDisplayWeight !== prompt.weight) {
          prompt.backgroundDisplayWeight = prompt.weight;
          changedInThisFrame = true;
        }
      } else {
        prompt.backgroundDisplayWeight +=
          diff * PromptDjMidi.BG_WEIGHT_SMOOTHING_FACTOR;
        changedInThisFrame = true;
        animationStillNeeded = true;
      }
    }

    if (changedInThisFrame) {
      this.requestUpdate();
    }

    if (animationStillNeeded) {
      this._bgWeightsAnimationId = requestAnimationFrame(
        this._animateBackgroundWeightsBound,
      );
    } else {
      this._bgWeightsAnimationId = null;
    }
  }

  private _startBackgroundWeightsAnimation(): void {
    if (this._bgWeightsAnimationId === null) {
      this._bgWeightsAnimationId = requestAnimationFrame(
        this._animateBackgroundWeightsBound,
      );
    }
  }

  private calculatePromptWeightedAverage(): void {
    let totalWeight = 0;
    const promptCount = this.prompts.size;

    if (promptCount === 0) {
      this.promptWeightedAverage = 0;
      return;
    }

    for (const prompt of this.prompts.values()) {
      totalWeight += prompt.weight;
    }

    this.promptWeightedAverage = totalWeight / promptCount;
    this.checkAndTriggerOverloadReset();
  }

  private async calculateKnobAverageExtremeness(): Promise<void> {
    await this.updateComplete;
    const extremenessValues: number[] = [];
    const knobKeys = Object.keys(PromptDjMidi.KNOB_CONFIGS) as Array<
      keyof typeof PromptDjMidi.KNOB_CONFIGS
    >;

    for (const knobId of knobKeys) {
      const config = PromptDjMidi.KNOB_CONFIGS[knobId];
      const isAuto = this[config.autoProperty as keyof this] as boolean;

      if (isAuto) {
        extremenessValues.push(0);
      } else {
        const currentValue = this.config[knobId] as number | null;
        // If still null for some reason (e.g. other knobs if they could be null), treat as default (0 extremeness)
        if (currentValue === null) {
          extremenessValues.push(0);
          continue;
        }

        const defaultValue = config.defaultValue;
        const minValue = config.min;
        const maxValue = config.max;
        const range = maxValue - minValue;

        if (range === 0) {
          extremenessValues.push(0);
        } else {
          const extremeness = Math.abs(currentValue - defaultValue) / range;
          extremenessValues.push(Math.min(1, Math.max(0, extremeness))); // Clamp 0-1
        }
      }
    }

    // Handle scale selector
    if (this.config.scale === PromptDjMidi.INITIAL_CONFIG.scale) {
      extremenessValues.push(0);
    } else {
      extremenessValues.push(1);
    }

    if (extremenessValues.length > 0) {
      const sum = extremenessValues.reduce((acc, val) => acc + val, 0);
      this.knobAverageExtremeness = sum / extremenessValues.length;
    } else {
      this.knobAverageExtremeness = 0;
    }
    this.checkAndTriggerOverloadReset();
  }

  private async checkAndTriggerOverloadReset(): Promise<void> {
    await this.updateComplete;
    const promptAverageCritical = 1.95;
    const knobExtremenessCritical = 0.95;
    const combinedFactorThreshold = 1.8; // (e.g. prompt avg 1.6 -> 0.8, knob avg 1.0 -> 1.0 => 1.8)

    // Normalize promptAverage to 0-1 for combined factor, then add knobExtremeness (already 0-1)
    // Max possible combinedFactor is 2.0 (promptAvg 2.0 -> 1.0; knobExtremeness 1.0 -> 1.0)
    const combinedFactor =
      this.promptWeightedAverage / 2 + this.knobAverageExtremeness;

    if (
      this.promptWeightedAverage >= promptAverageCritical ||
      this.knobAverageExtremeness >= knobExtremenessCritical ||
      combinedFactor >= combinedFactorThreshold
    ) {
      console.warn('DSP Overload detected! Resetting all parameters.');
      console.warn('Critical DSP Overload! Resetting parameters.');
      this.resetAll();
    }
  }

  private globalFlowTick(): void {
    let changesMade = false;

    if (this.isSeedFlowing) {
      let currentSeed = this.config.seed;
      if (currentSeed === null || currentSeed === undefined) {
        currentSeed = Math.floor(Math.random() * 1000000) + 1;
      }

      const baseMagnitude = Math.floor(Math.random() * 10) + 1;
      let seedChange = 0;

      if (this.flowDirectionUp && this.flowDirectionDown) {
        const direction = Math.random() < 0.5 ? 1 : -1;
        seedChange = baseMagnitude * direction * this.flowAmplitude;
      } else if (this.flowDirectionUp) {
        seedChange = baseMagnitude * this.flowAmplitude;
      } else if (this.flowDirectionDown) {
        seedChange = baseMagnitude * -1 * this.flowAmplitude;
      } else {
        seedChange = 0;
      }

      let newSeed = currentSeed + seedChange;
      const MIN_SEED_VALUE = 1;
      const MAX_SEED_VALUE = 9999999;
      newSeed = Math.max(MIN_SEED_VALUE, Math.min(newSeed, MAX_SEED_VALUE));

      if (this.config.seed !== newSeed) {
        this.config = { ...this.config, seed: newSeed };
        changesMade = true;
      }
    }

    for (const prompt of this.prompts.values()) {
      if (prompt.isAutoFlowing) {
        const baseMagnitude = Math.random() * 0.04 + 0.01;
        const direction = Math.random() < 0.5 ? 1 : -1;
        const weightChange =
          baseMagnitude * direction * (this.flowAmplitude / 10);

        let newWeight = prompt.weight + weightChange;
        newWeight = Math.max(0, Math.min(newWeight, 2));

        if (prompt.weight !== newWeight) {
          prompt.weight = newWeight;
          changesMade = true;
        }
      }
    }

    if (changesMade) {
      if (this.isSeedFlowing) {
        this._sendPlaybackParametersToSession();
      }
      this.setPrompts(this.prompts, true);
      this.requestUpdate();
      this.calculatePromptWeightedAverage();
      this._startBackgroundWeightsAnimation();
    }
  }

  private startGlobalFlowInterval() {
    if (this.globalFlowIntervalId) {
      clearInterval(this.globalFlowIntervalId);
    }
    this.globalFlowIntervalId = window.setInterval(
      this.globalFlowTick,
      1000 / this.flowFrequency,
    );
  }

  private stopGlobalFlowInterval() {
    if (this.globalFlowIntervalId) {
      clearInterval(this.globalFlowIntervalId);
      this.globalFlowIntervalId = null;
    }
  }

  private readonly makeBackground = throttle(
    () => {
      // clamp01 is now a static method: PromptDjMidi.clamp01
      const MAX_WEIGHT = 0.5; // Original constant name and value
      const MAX_ALPHA = 0.6; // Original constant name and value

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const displayWeight = p.backgroundDisplayWeight ?? p.weight;
        const alphaPct =
          PromptDjMidi.clamp01(displayWeight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = displayWeight / 2;
        const x = (i % 8) / 7;
        const y = Math.floor(i / 8) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    20, // Changed throttle delay from 30 to 20
  );

  private pause() {
    if (this.session) {
      this.session.pause();
    }
    this.playbackState = 'paused';
    if (this.outputNode && this.audioContext) {
      this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.1,
      );
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

  private async play() {
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      console.warn(
        'There needs to be one active prompt to play. Turn up a knob to resume playback.',
      );
      this.pause();
      return;
    }
    // No change here, await this.updateComplete was already in the correct place
    // The issue is the method signature itself.

    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.audioAnalyser = new AudioAnalyser(this.audioContext);
      this.audioAnalyser.node.connect(this.audioContext.destination);
      this.outputNode = this.audioContext.createGain();
      this.outputNode.connect(this.audioAnalyser.node); // Connect Gain to Analyser

      // Initialize MediaStreamDestinationNode for recording app audio
      this.mediaStreamDestinationNode =
        this.audioContext.createMediaStreamDestination();
      this.outputNode.connect(this.mediaStreamDestinationNode); // Connect Gain to DestinationNode as well

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
      this.outputNode.gain.linearRampToValueAtTime(
        1,
        this.audioContext.currentTime + 0.1,
      );
    }
  }

  private stop() {
    if (this.session) {
      this.session.stop();
    }
    this.playbackState = 'stopped';
    if (this.outputNode && this.audioContext) {
      this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(
        1,
        this.audioContext.currentTime + 0.1,
      );
    }
    this.nextStartTime = 0;
  }

  private async handleMainAudioButton() {
    await this.updateComplete;
    this.currentRetryAttempt = 0;

    if (!this.audioReady) {
      // Step 2.a: Check if API key is present
      if (this.geminiApiKey) {
        // Step 2.b: Validate API key format
        if (!this.isValidApiKeyFormat(this.geminiApiKey)) {
          // Step 2.c: Handle invalid format
          this.setTransientApiKeyStatus(
            'Invalid API Key format. Playback not started.',
          );
          this.apiKeyInvalid = true;
          this.apiKeySavedSuccessfully = false;
          this.playbackState = 'stopped';
          return;
        }
        // Step 2.d.i: Save valid key
        await this.saveApiKeyToLocalStorage();
        // Step 2.d.ii: Check if save failed
        if (this.apiKeyInvalid || !this.apiKeySavedSuccessfully) {
          this.playbackState = 'stopped';
          // Rely on message from saveApiKeyToLocalStorage or set a new one
          this.setTransientApiKeyStatus(
            'Failed to save API Key. Playback not started.',
          );
          return;
        }
      } else if (!this.geminiApiKey && !this.apiKeySavedSuccessfully) {
        // No API key in input, and none saved successfully prior (e.g. from localStorage load)
        // This implies we can't proceed if a key is required for connection.
        // However, connectToSession itself checks for this.geminiApiKey.
        // If no key is available at all (neither in input nor previously loaded and valid),
        // connectToSession will warn and return. We let it handle that specific message.
      }

      // Step 2.e: Proceed with loading
      this.playbackState = 'loading';
      // Step 2.f: Connect to session
      await this.connectToSession();

      // Step 2.g: Handle connection failure
      if (this.connectionError || this.apiKeyInvalid) {
        this.playbackState = 'stopped';
        console.warn(
          'Failed to connect. Please check your API key and connection.',
        );
        return;
      }
      // Step 2.h: Set session prompts
      await this.setSessionPrompts();
      // Step 2.i: Play
      this.play();
    } else {
      // Step 3: Audio is ready
      if (this.playbackState === 'playing') {
        this.pause();
      } else if (
        this.playbackState === 'paused' ||
        this.playbackState === 'stopped'
      ) {
        // Step 3.b.i: Check for existing errors before trying to play again
        if (this.connectionError || this.apiKeyInvalid) {
          this.playbackState = 'loading';

          // Re-validate and attempt to save the current key if present
          if (this.geminiApiKey) {
            if (!this.isValidApiKeyFormat(this.geminiApiKey)) {
              this.setTransientApiKeyStatus(
                'Invalid API Key format. Playback not started.',
              );
              this.apiKeyInvalid = true;
              this.apiKeySavedSuccessfully = false;
              this.playbackState = 'stopped';
              return;
            }
            await this.saveApiKeyToLocalStorage();
            if (this.apiKeyInvalid || !this.apiKeySavedSuccessfully) {
              this.playbackState = 'stopped';
              this.setTransientApiKeyStatus(
                'Failed to save API Key. Playback not started.',
              );
              return;
            }
          }

          await this.connectToSession();
          if (this.connectionError || this.apiKeyInvalid) {
            this.playbackState = 'stopped';
            console.warn(
              'Failed to reconnect. Please check your connection or API key.',
            );
            return;
          }
        }
        // Step 3.b.ii: (or continuation after successful re-connect)
        await this.setSessionPrompts();
        this.play();
      } else if (this.playbackState === 'loading') {
        this.stop();
      }
    }
  }

  private get isAnyFlowActive(): boolean {
    const isAnyPromptAutoFlowing = [...this.prompts.values()].some(
      (p) => p.isAutoFlowing,
    );
    return this.isSeedFlowing || isAnyPromptAutoFlowing;
  }

  private async toggleShowMidi() {
    this.showMidi = !this.showMidi;
    if (!this.showMidi) return;
    const inputIds = await this.midiDispatcher.getMidiAccess();
    this.midiInputIds = inputIds;
    this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
  }

  private toggleSeedFlow() {
    this.isSeedFlowing = !this.isSeedFlowing;

    if (this.isSeedFlowing) {
      // If Flow is ON and seed is currently null (Auto), generate a new seed.
      if (this.config.seed === null) {
        this.config = {
          ...this.config,
          seed: Math.floor(Math.random() * 1000000) + 1,
        };
      }
    } else {
      // If Flow is turned OFF, set seed back to null (Auto).
      this.config = { ...this.config, seed: null };
    }

    this._sendPlaybackParametersToSession(); // Send updated seed (or null) to backend
    this.requestUpdate(); // Ensure UI reflects the change

    if (this.isAnyFlowActive) {
      // This condition now also depends on the updated isSeedFlowing
      this.startGlobalFlowInterval();
    } else {
      this.stopGlobalFlowInterval();
    }
  }

  private handleFlowFrequencyChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.flowFrequency = Number.parseInt(inputElement.value, 10);
    if (this.isAnyFlowActive) {
      this.stopGlobalFlowInterval();
      this.startGlobalFlowInterval();
    }
  }

  private handleIncreaseFreq() {
    this.adjustFrequency(true);
  }

  private handleDecreaseFreq() {
    this.adjustFrequency(false);
  }

  private handleFreqButtonPress(isIncreasing: boolean) {
    this.isFreqButtonPressed = true;
    this.adjustFrequency(isIncreasing); // Call once immediately

    this.clearFreqAdjustInterval(); // Clear any existing interval

    this.freqAdjustIntervalId = window.setInterval(() => {
      if (this.isFreqButtonPressed) {
        this.adjustFrequency(isIncreasing);
      } else {
        this.clearFreqAdjustInterval();
      }
    }, 150);
  }

  private handleFreqButtonRelease() {
    this.isFreqButtonPressed = false;
    this.clearFreqAdjustInterval();
  }

  private clearFreqAdjustInterval() {
    if (this.freqAdjustIntervalId !== null) {
      clearInterval(this.freqAdjustIntervalId);
      this.freqAdjustIntervalId = null;
    }
  }

  private adjustFrequency(isIncreasing: boolean) {
    const currentHz = this.flowFrequency; // Already in Hz
    let step = 0;

    if (currentHz > 1.0) {
      step = 1.0;
    } else if (currentHz === 1.0) {
      step = isIncreasing ? 1.0 : 0.1; // Special step for 1.0 Hz
    } else if (currentHz > 0.1) {
      step = 0.1;
    } else if (currentHz === 0.1) {
      step = isIncreasing ? 0.1 : 0.01; // Special step for 0.1 Hz
    } else {
      // currentHz < 0.1 Hz and not exactly 0.1
      step = 0.01;
    }

    let newHz = isIncreasing ? currentHz + step : currentHz - step;

    // Ensure newHz doesn't become 0 or less, clamp to MIN_FLOW_FREQUENCY_HZ
    if (newHz < PromptDjMidi.MIN_FLOW_FREQUENCY_HZ) {
      newHz = PromptDjMidi.MIN_FLOW_FREQUENCY_HZ;
    }

    // Clamp to MAX_FLOW_FREQUENCY_HZ
    newHz = Math.min(newHz, PromptDjMidi.MAX_FLOW_FREQUENCY_HZ);

    // Round to appropriate decimal places
    if (newHz >= 1.0) {
      newHz = Number.parseFloat(newHz.toFixed(1)); // Handles cases like 0.9 + 0.1 = 1.0 without becoming 1.00
    } else {
      // For values < 1.0 Hz, use two decimal places
      newHz = Number.parseFloat(newHz.toFixed(2));
    }
    // Ensure it does not become exactly 0 after rounding if it was meant to be MIN_FLOW_FREQUENCY_HZ
    if (newHz === 0 && currentHz > 0 && !isIncreasing) {
      newHz = PromptDjMidi.MIN_FLOW_FREQUENCY_HZ;
    }

    this.flowFrequency = newHz;

    if (this.isAnyFlowActive) {
      this.stopGlobalFlowInterval();
      this.startGlobalFlowInterval();
    }
    this.requestUpdate();
  }

  private handleFlowAmplitudeChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.flowAmplitude = Number.parseInt(inputElement.value, 10);
    if (this.isAnyFlowActive) {
      this.stopGlobalFlowInterval();
      this.startGlobalFlowInterval();
    }
  }

  private handleAmpButtonPress(isIncreasing: boolean) {
    this.isAmpButtonPressed = true;
    this.adjustAmplitude(isIncreasing); // Call once immediately

    this.clearAmpAdjustInterval(); // Clear any existing interval

    this.ampAdjustIntervalId = window.setInterval(() => {
      if (this.isAmpButtonPressed) {
        this.adjustAmplitude(isIncreasing);
      } else {
        this.clearAmpAdjustInterval();
      }
    }, 150); // Adjust interval as needed for responsiveness
  }

  private handleAmpButtonRelease() {
    this.isAmpButtonPressed = false;
    this.clearAmpAdjustInterval();
  }

  private clearAmpAdjustInterval() {
    if (this.ampAdjustIntervalId !== null) {
      clearInterval(this.ampAdjustIntervalId);
      this.ampAdjustIntervalId = null;
    }
  }

  private adjustAmplitude(isIncreasing: boolean) {
    let newAmp = this.flowAmplitude;
    if (isIncreasing) {
      newAmp += this.ampStep;
    } else {
      newAmp -= this.ampStep;
    }

    newAmp = Math.min(newAmp, this.MAX_AMP_VALUE);
    newAmp = Math.max(newAmp, this.MIN_AMP_VALUE);

    this.flowAmplitude = newAmp;

    if (this.isAnyFlowActive) {
      this.stopGlobalFlowInterval();
      this.startGlobalFlowInterval();
    }
    this.requestUpdate();
  }

  private toggleFlowDirection(direction: 'up' | 'down') {
    if (direction === 'up') {
      this.flowDirectionUp = !this.flowDirectionUp;
    } else if (direction === 'down') {
      this.flowDirectionDown = !this.flowDirectionDown;
    }
    this.requestUpdate();
    if (this.isAnyFlowActive) {
      this.stopGlobalFlowInterval();
      this.startGlobalFlowInterval();
    } else {
      this.stopGlobalFlowInterval();
    }
  }

  private handlePromptAutoFlowToggled(
    event: CustomEvent<{ promptId: string; isAutoFlowing: boolean }>,
  ) {
    const { promptId, isAutoFlowing: newIsAutoFlowingState } = event.detail;
    const prompt = this.prompts.get(promptId);

    if (prompt) {
      prompt.isAutoFlowing = newIsAutoFlowingState;
      this.prompts.set(promptId, prompt);
      this.requestUpdate();

      if (this.isAnyFlowActive) {
        this.startGlobalFlowInterval();
      } else {
        this.stopGlobalFlowInterval();
      }
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private async saveApiKeyToLocalStorage() {
    await this.updateComplete;
    const MAX_RETRIES = 3;
    const INITIAL_BACKOFF_DELAY = 1000; // 1 second

    if (this.geminiApiKey && !this.isValidApiKeyFormat(this.geminiApiKey)) {
      this.setTransientApiKeyStatus('Invalid API Key format');
      this.apiKeyInvalid = true;
      this.apiKeySavedSuccessfully = false;
      this.showApiKeyControls = true; // Ensure controls are visible for correction
      // Removed this.handleMainAudioButton(); as per previous step
      return;
    }

    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot save or remove Gemini API key from localStorage.',
      );
      this.apiKeyInvalid = true; // Or some other state to indicate failure
      this.connectionError = true; // Or some other state to indicate failure
      this.apiKeySavedSuccessfully = false;
      this.showApiKeyControls = true; // Ensure controls are visible
      // Removed this.handleMainAudioButton();
      return;
    }

    if (!this.geminiApiKey) {
      try {
        localStorage.removeItem('geminiApiKey');
        console.log('Gemini API key removed from local storage.');
        this.apiKeyInvalid = false;
        this.connectionError = false;
        this.apiKeySavedSuccessfully = false; // Key is cleared, so not "successfully saved"
        this.setTransientApiKeyStatus('API Key Cleared');
        this.showApiKeyControls = true; // Show controls as no key is active
      } catch (error) {
        // This case is less likely for removeItem, but good to be aware
        console.error('Error removing API key from local storage:', error);
        this.apiKeySavedSuccessfully = false;
        this.showApiKeyControls = true;
        // Optionally set states to indicate this specific type of error
      }
      // Removed this.handleMainAudioButton();
      // Removed this.checkApiKeyStatus(); // Call is deferred or handled by caller
      return;
    }

    let retries = 0;
    let success = false;
    while (retries < MAX_RETRIES && !success) {
      try {
        localStorage.setItem('geminiApiKey', this.geminiApiKey);
        this.apiKeyInvalid = false; // Explicitly set to false on successful save
        this.connectionError = false;
        console.log(
          `Gemini API key saved to local storage (attempt ${retries + 1}).`,
        );
        success = true;
        this.apiKeySavedSuccessfully = true;
        this.setTransientApiKeyStatus('API Key is saved and valid');
        this.showApiKeyControls = false; // Hide controls on successful save
      } catch (error) {
        retries++;
        const delay = INITIAL_BACKOFF_DELAY * 2 ** (retries - 1);
        console.warn(
          `Attempt ${retries} to save API key failed. Retrying in ${delay}ms...`,
          error,
        );
        if (retries < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (!success) {
      console.error(`Failed to save API key after ${MAX_RETRIES} attempts.`);
      this.apiKeyInvalid = true;
      this.apiKeySavedSuccessfully = false;
      this.showApiKeyControls = true; // Ensure controls are visible if save fails
      this.connectionError = true; // Or a more specific error state
    }
    // as checkApiKeyStatus might influence UI related to the button's action.
  }

  private checkApiKeyStatus() {
    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot verify API key status.',
      );
      this.apiKeySavedSuccessfully = false;
      this.showApiKeyControls = true; // Show controls if localStorage is unavailable
      return;
    }
    try {
      const storedApiKey = localStorage.getItem('geminiApiKey');

      if (storedApiKey) {
        if (!this.isValidApiKeyFormat(storedApiKey)) {
          this.apiKeySavedSuccessfully = false;
          this.apiKeyInvalid = true;
          this.showApiKeyControls = true; // Show controls if stored key is invalid
          // Clear the key from storage if it's invalidly formatted
          try {
            localStorage.removeItem('geminiApiKey');
            console.warn(
              'Removed invalidly formatted API key from localStorage.',
            );
          } catch (e) {
            console.error(
              'Error removing invalidly formatted API key from localStorage:',
              e,
            );
          }
          // Only set this message if no other more specific message (like "Invalid API Key format" from save) is active.
          if (
            this.transientApiKeyStatusMessage === null ||
            !this.transientApiKeyStatusMessage.includes(
              'Invalid API Key format',
            )
          ) {
            this.setTransientApiKeyStatus(
              'Stored API Key had invalid format and was cleared',
            );
          }
          return; // Stop further checks if format is invalid
        }

        // Stored key has valid format
        this.apiKeyInvalid = false; // Key format is valid
        if (this.geminiApiKey && storedApiKey === this.geminiApiKey) {
          this.apiKeySavedSuccessfully = true;
          this.showApiKeyControls = false; // Hide controls if key matches and is valid
          if (
            this.transientApiKeyStatusMessage === null ||
            !['API Key Saved', 'API Key Cleared'].includes(
              this.transientApiKeyStatusMessage,
            )
          ) {
            this.setTransientApiKeyStatus('API Key Loaded');
          }
          console.log(
            'API key is verified and saved correctly in localStorage.',
          );
        } else if (!this.geminiApiKey) {
          // Stored key is valid, but no key in component state (e.g., loaded on init)
          this.geminiApiKey = storedApiKey;
          this.apiKeySavedSuccessfully = true;
          this.showApiKeyControls = false; // Hide controls as a valid key is loaded
          if (
            this.transientApiKeyStatusMessage === null ||
            !['API Key Saved', 'API Key Cleared'].includes(
              this.transientApiKeyStatusMessage,
            )
          ) {
            this.setTransientApiKeyStatus('API Key Loaded from storage');
          }
          console.log('API key loaded from localStorage into component state.');
        } else {
          // storedApiKey is valid, this.geminiApiKey is present, but they don't match
          this.apiKeySavedSuccessfully = false;
          this.showApiKeyControls = true; // Show controls as current component key is not the one saved
          console.warn(
            'API key in component does not match valid stored API key. Needs re-saving if current key is intended.',
          );
        }
      } else {
        // No storedApiKey
        this.apiKeySavedSuccessfully = false;
        this.showApiKeyControls = true; // Show controls if no key in storage
        if (this.geminiApiKey) {
          // Key in component but not in storage - implies it needs to be saved.
          console.log(
            'API key present in component but not in localStorage. Needs saving.',
          );
        } else {
          // No key in storage, no key in component.
          console.log('No API key found in local storage or component.');
          if (this.transientApiKeyStatusMessage !== 'API Key Cleared') {
            // this.setTransientApiKeyStatus(null); // Or a specific message like "No API Key"
          }
        }
      }
    } catch (error) {
      console.error('Error checking API key status from localStorage:', error);
      this.showApiKeyControls = true; // Show controls on error
      this.apiKeySavedSuccessfully = false;
    }
  }

  private setTransientApiKeyStatus(message: string | null, duration = 2500) {
    if (this.apiKeyMessageTimeoutId !== null) {
      clearTimeout(this.apiKeyMessageTimeoutId);
    }
    this.transientApiKeyStatusMessage = message;
    if (message !== null) {
      this.apiKeyMessageTimeoutId = setTimeout(() => {
        this.transientApiKeyStatusMessage = null;
        this.apiKeyMessageTimeoutId = null;
      }, duration);
    }
    // Request update is handled by @state decorator for transientApiKeyStatusMessage
  }

  private togglePresetControlsVisibility() {
    this.showPresetControls = !this.showPresetControls;
  }

  // Preset Management Methods
  private loadAvailablePresets() {
    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot load presets from prompt_presets_v2.',
      );
      this.availablePresets = [];
      return;
    }
    try {
      const storedPresets = localStorage.getItem('prompt_presets_v2');
      if (storedPresets) {
        try {
          const parsedPresets = JSON.parse(storedPresets);
          if (typeof parsedPresets === 'object' && parsedPresets !== null) {
            this.availablePresets = Object.keys(parsedPresets);
            console.log(
              'Successfully loaded available presets from localStorage (prompt_presets_v2):',
              this.availablePresets,
            );
          } else {
            console.warn(
              'Stored presets format (prompt_presets_v2) is invalid, expected an object. Using empty list.',
            );
            this.availablePresets = [];
            // localStorage.removeItem('prompt_presets_v2'); // Optionally remove
          }
        } catch (parseError) {
          console.error(
            'Failed to parse stored presets from localStorage (prompt_presets_v2). Data might be corrupted.',
            parseError,
          );
          this.availablePresets = [];
          // localStorage.removeItem('prompt_presets_v2'); // Optionally remove
        }
      } else {
        console.log(
          'No presets found in localStorage (prompt_presets_v2). Initializing with empty list.',
        );
        this.availablePresets = [];
      }
    } catch (e) {
      console.error(
        'Error accessing localStorage to retrieve presets (prompt_presets_v2).',
        e,
      );
      this.availablePresets = [];
    }
  }

  private handlePresetNameInputChange(e: Event) {
    this.presetNameToSave = (e.target as HTMLInputElement).value;
  }

  private handleSavePresetClick() {
    const presetName = this.presetNameToSave.trim();
    if (!presetName) {
      console.warn('Preset name cannot be empty.');
      return;
    }

    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot save preset to prompt_presets_v2.',
      );
      return;
    }

    // Gather all data for the preset
    const promptsArray = [...this.prompts.values()];
    const currentConfig = { ...this.config };
    const currentAutoStates = {
      autoDensity: this.autoDensity,
      autoBrightness: this.autoBrightness,
      autoBpm: this.autoBpm,
      autoTemperature: this.autoTemperature,
      autoTopK: this.autoTopK,
      autoGuidance: this.autoGuidance,
      isSeedFlowing: this.isSeedFlowing, // Save the state of the main Flow button
      flowFrequency: this.flowFrequency, // Save flowFrequency
      flowAmplitude: this.flowAmplitude, // Save flowAmplitude
    };
    const currentLastDefinedStates = {
      lastDefinedDensity: this.lastDefinedDensity,
      lastDefinedBrightness: this.lastDefinedBrightness,
      lastDefinedBpm: this.lastDefinedBpm,
      lastDefinedTemperature: this.lastDefinedTemperature,
      lastDefinedTopK: this.lastDefinedTopK,
      lastDefinedGuidance: this.lastDefinedGuidance,
    };

    // Create the comprehensive preset data object
    const presetData = {
      prompts: promptsArray,
      config: currentConfig,
      autoStates: currentAutoStates,
      lastDefinedStates: currentLastDefinedStates,
      isSeedFlowing: this.isSeedFlowing, // Also add to the main presetData object
      flowFrequency: this.flowFrequency, // Also add to the main presetData object
      flowAmplitude: this.flowAmplitude, // Also add to the main presetData object
    };
    const presetDataString = JSON.stringify(presetData);

    // Load existing main presets object
    let allPresets: { [key: string]: string } = {}; // Stores presetName: stringifiedPresetData
    try {
      const existingPresetsString = localStorage.getItem('prompt_presets_v2');
      if (existingPresetsString) {
        try {
          const parsed = JSON.parse(existingPresetsString);
          if (typeof parsed === 'object' && parsed !== null) {
            allPresets = parsed;
          } else {
            console.warn(
              'Existing presets data (prompt_presets_v2) is not a valid object. Starting with a new preset list.',
            );
          }
        } catch (parseError) {
          console.error(
            'Failed to parse existing presets (prompt_presets_v2) from localStorage. Data might be corrupted. Starting with a new preset list and overwriting.',
            parseError,
          );
          allPresets = {}; // Overwrite corrupted data
        }
      }
    } catch (accessError) {
      console.error(
        'Error accessing localStorage to retrieve existing presets (prompt_presets_v2). Cannot save.',
        accessError,
      );
      return;
    }

    // Add/update the new preset (storing the stringified presetData)
    allPresets[presetName] = presetDataString;

    // Save updated main presets object
    try {
      localStorage.setItem('prompt_presets_v2', JSON.stringify(allPresets));
      console.log(
        `Preset '${presetName}' saved successfully to prompt_presets_v2.`,
      );
      this.loadAvailablePresets(); // Refresh the dropdown
      this.selectedPreset = presetName; // Select the newly saved preset
      this.presetNameToSave = ''; // Clear the input field
    } catch (saveError) {
      console.error(
        `Error saving preset '${presetName}' to localStorage (prompt_presets_v2).`,
        saveError,
      );
    }
  }

  private handlePresetSelectedChange(e: Event) {
    this.selectedPreset = (e.target as HTMLSelectElement).value;

    if (!this.selectedPreset) {
      console.log("No preset selected or 'Load Preset' option chosen.");
      return;
    }

    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot load preset from prompt_presets_v2.',
      );
      return;
    }

    let allPresets: { [key: string]: string } = {};
    try {
      const storedPresetsString = localStorage.getItem('prompt_presets_v2');
      if (!storedPresetsString) {
        console.error(
          'No presets found in localStorage (prompt_presets_v2). Cannot load:',
          this.selectedPreset,
        );
        return;
      }
      allPresets = JSON.parse(storedPresetsString);
    } catch (error) {
      console.error(
        "Error accessing or parsing 'prompt_presets_v2' from localStorage.",
        error,
      );
      return;
    }

    const presetDataString = allPresets[this.selectedPreset];
    if (!presetDataString) {
      console.error(
        `Preset '${this.selectedPreset}' not found in stored presets (prompt_presets_v2).`,
      );
      return;
    }

    let loadedPresetData;
    try {
      loadedPresetData = JSON.parse(presetDataString);
    } catch (error) {
      console.error(
        `Error parsing preset data for '${this.selectedPreset}' from prompt_presets_v2.`,
        error,
      );
      return;
    }

    // Validate loadedPresetData structure (basic check)
    if (
      !loadedPresetData ||
      typeof loadedPresetData !== 'object' ||
      !loadedPresetData.prompts ||
      !loadedPresetData.config ||
      !loadedPresetData.autoStates ||
      !loadedPresetData.lastDefinedStates ||
      loadedPresetData.isSeedFlowing === undefined || // Check for isSeedFlowing
      loadedPresetData.flowFrequency === undefined || // Check for flowFrequency
      loadedPresetData.flowAmplitude === undefined
    ) {
      // Check for flowAmplitude
      console.error(
        `Corrupted preset data for '${this.selectedPreset}' in prompt_presets_v2. Missing essential keys.`,
      );
      return;
    }

    // Apply Prompts
    const promptsArray = loadedPresetData.prompts as Prompt[];
    promptsArray.forEach((p) => {
      // Ensure required fields have defaults if loading older presets
      if (p.isAutoFlowing === undefined) p.isAutoFlowing = false;
      if (p.activatedFromZero === undefined) p.activatedFromZero = false;
      if (p.backgroundDisplayWeight === undefined)
        p.backgroundDisplayWeight = p.weight;
    });
    const newPromptsMap = new Map(promptsArray.map((p) => [p.promptId, p]));

    // Iterate over newPromptsMap to ensure backgroundDisplayWeight is set if somehow missed
    // (though the loop above should cover it for presets)
    for (const p of newPromptsMap.values()) {
      if (p.backgroundDisplayWeight === undefined) {
        p.backgroundDisplayWeight = p.weight;
      }
    }

    this.setPrompts(newPromptsMap, true);

    // Apply Config
    // Ensure all keys from INITIAL_CONFIG are present, then override with loadedPresetData.config
    this.config = {
      ...PromptDjMidi.INITIAL_CONFIG,
      ...loadedPresetData.config,
    };

    // Apply Auto States
    this.autoDensity = loadedPresetData.autoStates.autoDensity;
    this.autoBrightness = loadedPresetData.autoStates.autoBrightness;
    this.autoBpm = loadedPresetData.autoStates.autoBpm;
    this.autoTemperature =
      loadedPresetData.autoStates.autoTemperature !== undefined
        ? loadedPresetData.autoStates.autoTemperature
        : PromptDjMidi.INITIAL_AUTO_STATES.autoTemperature;
    this.autoTopK =
      loadedPresetData.autoStates.autoTopK !== undefined
        ? loadedPresetData.autoStates.autoTopK
        : PromptDjMidi.INITIAL_AUTO_STATES.autoTopK;
    this.autoGuidance =
      loadedPresetData.autoStates.autoGuidance !== undefined
        ? loadedPresetData.autoStates.autoGuidance
        : PromptDjMidi.INITIAL_AUTO_STATES.autoGuidance;

    // Apply Last Defined States
    this.lastDefinedDensity =
      loadedPresetData.lastDefinedStates.lastDefinedDensity;
    this.lastDefinedBrightness =
      loadedPresetData.lastDefinedStates.lastDefinedBrightness;
    this.lastDefinedBpm = loadedPresetData.lastDefinedStates.lastDefinedBpm;
    this.lastDefinedTemperature =
      loadedPresetData.lastDefinedStates.lastDefinedTemperature !== undefined
        ? loadedPresetData.lastDefinedStates.lastDefinedTemperature
        : PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTemperature;
    this.lastDefinedTopK =
      loadedPresetData.lastDefinedStates.lastDefinedTopK !== undefined
        ? loadedPresetData.lastDefinedStates.lastDefinedTopK
        : PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTopK;
    this.lastDefinedGuidance =
      loadedPresetData.lastDefinedStates.lastDefinedGuidance !== undefined
        ? loadedPresetData.lastDefinedStates.lastDefinedGuidance
        : PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedGuidance;

    // Update Application & UI
    this.requestUpdate(); // Request LitElement to re-render with all new state.
    this._sendPlaybackParametersToSession(); // Send new config to backend.
    this.calculateKnobAverageExtremeness(); // Update UI related to knob extremeness.
    // calculatePromptWeightedAverage is called by setPrompts

    // Apply auto states to config and manage flow after all states are loaded
    this._applyLoadedAutoStatesToConfigAndFlow(
      loadedPresetData.autoStates,
      loadedPresetData.isSeedFlowing,
      loadedPresetData.flowFrequency, // Pass flowFrequency
      loadedPresetData.flowAmplitude, // Pass flowAmplitude
    );

    console.log(
      `Preset '${this.selectedPreset}' loaded successfully from prompt_presets_v2.`,
    );
  }

  private _applyLoadedAutoStatesToConfigAndFlow(
    loadedAutoStates: typeof PromptDjMidi.INITIAL_AUTO_STATES & {
      isSeedFlowing?: boolean;
    },
    loadedIsSeedFlowing: boolean,
    loadedFlowFrequency: number, // Add loadedFlowFrequency parameter
    loadedFlowAmplitude: number, // Add loadedFlowAmplitude parameter
  ) {
    // Apply auto states for knobs
    const knobKeys = Object.keys(PromptDjMidi.KNOB_CONFIGS) as Array<
      keyof typeof PromptDjMidi.KNOB_CONFIGS
    >;
    let newConfig = { ...this.config };

    for (const knobId of knobKeys) {
      const config = PromptDjMidi.KNOB_CONFIGS[knobId];
      const autoProperty =
        config.autoProperty as keyof typeof PromptDjMidi.INITIAL_AUTO_STATES;
      const defaultValue = config.defaultValue;

      if (loadedAutoStates[autoProperty]) {
        // If auto is ON in the loaded preset, set the config value to its initial auto default
        newConfig = { ...newConfig, [knobId]: defaultValue };
      }
      // If auto is OFF, the value from loadedPresetData.config (already applied) should be used.
    }

    // Handle BPM separately as its auto default is null
    if (loadedAutoStates.autoBpm) {
      newConfig = { ...newConfig, bpm: null };
    }

    // Update the component's config state
    this.config = newConfig;

    // Handle isSeedFlowing
    this.isSeedFlowing = loadedIsSeedFlowing;

    // Apply flowFrequency and flowAmplitude
    this.flowFrequency = loadedFlowFrequency;
    this.flowAmplitude = loadedFlowAmplitude;

    // Start/stop global flow interval based on the combined flow state
    if (this.isAnyFlowActive) {
      this.startGlobalFlowInterval();
    } else {
      this.stopGlobalFlowInterval();
    }

    this.requestUpdate(); // Ensure UI reflects the changes
  }

  private handleDeletePresetClick() {
    if (!this.selectedPreset) {
      console.warn('No preset selected to delete.');
      return;
    }

    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot delete preset from prompt_presets_v2.',
      );
      return;
    }

    let allPresets: { [key: string]: string } = {};
    try {
      const storedPresetsString = localStorage.getItem('prompt_presets_v2');
      if (!storedPresetsString) {
        console.error(
          'No presets found in localStorage (prompt_presets_v2) to delete from.',
        );
        // Might happen if deleted by another tab/window or manually
        this.loadAvailablePresets(); // Refresh list in case it's out of sync
        this.selectedPreset = '';
        return;
      }
      allPresets = JSON.parse(storedPresetsString);
    } catch (error) {
      console.error(
        "Error accessing or parsing 'prompt_presets_v2' from localStorage for deletion.",
        error,
      );
      return;
    }

    if (!allPresets.hasOwnProperty(this.selectedPreset)) {
      console.warn(
        `Preset '${this.selectedPreset}' not found in stored presets (prompt_presets_v2). Cannot delete.`,
      );
      // It might have been deleted by another tab/window. Refresh list.
      this.loadAvailablePresets();
      this.selectedPreset = '';
      return;
    }

    delete allPresets[this.selectedPreset];

    try {
      localStorage.setItem('prompt_presets_v2', JSON.stringify(allPresets));
      console.log(
        `Preset '${this.selectedPreset}' deleted successfully from prompt_presets_v2.`,
      );
      this.loadAvailablePresets(); // Refresh the dropdown
      this.selectedPreset = ''; // Reset dropdown to default
    } catch (saveError) {
      console.error(
        'Error saving updated presets to localStorage (prompt_presets_v2) after deletion.',
        saveError,
      );
    }
  }

  private handleApiKeyInputChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.geminiApiKey = inputElement.value;
    // When the input changes, apiKeySavedSuccessfully should reflect that the current value might not be saved.
    // However, checkApiKeyStatus() is called at the end of saveApiKeyToLocalStorage,
    // so the debounced call will eventually update this.
    // For immediate feedback that the key is "dirty", we can set it here.
    // But the current UI logic for "Unsaved Key" depends on geminiApiKey being truthy
    // and apiKeySavedSuccessfully being false, which checkApiKeyStatus will handle.
  }

  private async handlePasteApiKeyClick() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      console.warn('Clipboard API not available or readText not supported.');
      // Optionally, update a state to inform the user via UI
      // this.clipboardError = 'Clipboard API not available.';
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        this.geminiApiKey = text.trim();
        await this.requestUpdate(); // Ensure the input field updates
        console.log('API Key pasted from clipboard.');
        await this.saveApiKeyToLocalStorage(); // Direct save
      } else {
        console.warn('Clipboard is empty or contains only whitespace.');
        // Optionally, update a state to inform the user
        // this.clipboardError = 'Clipboard is empty.';
      }
    } catch (err) {
      console.error('Failed to read from clipboard:', err);
      // Optionally, update a state to inform the user
      // this.clipboardError = 'Failed to paste from clipboard. Permission might be denied.';
    }
  }

  private async handleSaveApiKeyClick() {
    if (!this.geminiApiKey) {
      this.setTransientApiKeyStatus('No API Key to save');
      return;
    }

    if (!this.isValidApiKeyFormat(this.geminiApiKey)) {
      this.setTransientApiKeyStatus('Invalid API Key format. Cannot save.');
      this.apiKeyInvalid = true;
      this.apiKeySavedSuccessfully = false;
      this.requestUpdate();
      return;
    }

    await this.saveApiKeyToLocalStorage();
    this.requestUpdate();
  }

  private async handleClearApiKeyClick() {
    this.geminiApiKey = null;
    await this.saveApiKeyToLocalStorage();
    this.requestUpdate();
  }

  private handleManageApiKeyClick() {
    this.showApiKeyControls = true;
    this.requestUpdate();
  }

  private getApiKey() {
    window.open('https://aistudio.google.com/apikey', '_blank');
  }
  // MediaRecorder methods
  private async startRecording() {
    // Ensure audio context and output nodes are ready
    if (!this.audioContext || !this.outputNode) {
      console.error(
        'AudioContext or outputNode not initialized. Cannot start recording.',
      );
      // Attempt to initialize audio if it's not ready (e.g., user clicks record before play)
      // This assumes `play()` correctly sets up audioContext and outputNode.
      // Or, consider disabling record button until audio is ready.
      if (!this.audioReady) {
        await this.play(); // Try to initialize audio stack via play()
        if (!this.audioContext || !this.outputNode) {
          console.error('Failed to initialize audio stack for recording.');
          this.isRecordingActive = false;
          this.requestUpdate();
          return;
        }
      }
    }

    // Initialize MediaStreamDestinationNode if it hasn't been, or if context was recreated
    if (
      !this.mediaStreamDestinationNode ||
      this.mediaStreamDestinationNode.context !== this.audioContext
    ) {
      if (this.audioContext && this.outputNode) {
        this.mediaStreamDestinationNode =
          this.audioContext.createMediaStreamDestination();
        this.outputNode.connect(this.mediaStreamDestinationNode);
        console.log('Initialized MediaStreamDestinationNode for recording.');
      } else {
        console.error(
          'Cannot initialize MediaStreamDestinationNode: AudioContext or outputNode missing.',
        );
        this.isRecordingActive = false;
        this.requestUpdate();
        return;
      }
    }

    this.audioStream = this.mediaStreamDestinationNode.stream; // Use the stream from the destination node

    try {
      const mediaRecorderOptions = {
        mimeType: 'audio/ogg;codecs=opus',
        audioBitsPerSecond: 256000,
      };

      if (isOpusPolyfillActive) {
        this.mediaRecorder = new (window as any).MediaRecorder(
          this.audioStream,
          mediaRecorderOptions,
          opusWorkerOptions,
        );
      } else {
        this.mediaRecorder = new MediaRecorder(
          this.audioStream,
          mediaRecorderOptions,
        );
      }

      this.audioChunks = []; // Clear previous chunks

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/ogg' });
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = 'recording.ogg';
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.audioChunks = []; // Clear chunks for next recording
        this.isRecordingActive = false;

        // DO NOT stop tracks on this.audioStream from MediaStreamAudioDestinationNode
        // this.audioStream = null; // We can nullify our reference, but the node's stream persists.

        this.requestUpdate();
      };

      this.mediaRecorder.start();
      this.isRecordingActive = true;
    } catch (err) {
      console.error(
        'Failed to start recording with MediaStreamDestination:',
        err,
      );
      this.isRecordingActive = false;
    }
    this.requestUpdate(); // Ensure UI updates with isRecordingActive
  }

  private stopRecording() {
    if (this.mediaRecorder && this.isRecordingActive) {
      this.mediaRecorder.stop();
      // isRecordingActive will be set to false in onstop
    } else {
      console.log('MediaRecorder not active or not initialized for stopping.');
      // Ensure UI consistency if called unexpectedly
      if (this.isRecordingActive) {
        this.isRecordingActive = false;
        this.requestUpdate();
      }
    }
  }

  private async handleRecordClick() {
    if (this.isRecordingActive) {
      // stopRecording is synchronous in its current implementation
      // but good practice if it might become async
      this.stopRecording();
    } else {
      await this.startRecording();
    }
    // isRecordingActive state is updated within startRecording/stopRecording's onstop
    // and because it's a @state property, Lit should handle re-rendering the record-button.
  }
  private resetAll() {
    this.config = { ...PromptDjMidi.INITIAL_CONFIG };

    this.autoDensity = PromptDjMidi.INITIAL_AUTO_STATES.autoDensity;
    this.autoBrightness = PromptDjMidi.INITIAL_AUTO_STATES.autoBrightness;
    this.autoBpm = PromptDjMidi.INITIAL_AUTO_STATES.autoBpm;
    // Also reset other auto states for knobs
    this.autoTemperature = PromptDjMidi.INITIAL_AUTO_STATES.autoTemperature;
    this.autoTopK = PromptDjMidi.INITIAL_AUTO_STATES.autoTopK;
    this.autoGuidance = PromptDjMidi.INITIAL_AUTO_STATES.autoGuidance;

    this.lastDefinedDensity =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedDensity;
    this.lastDefinedBrightness =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBrightness;
    this.lastDefinedBpm =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedBpm;
    this.lastDefinedTemperature =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTemperature;
    this.lastDefinedTopK =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedTopK;
    this.lastDefinedGuidance =
      PromptDjMidi.INITIAL_LAST_DEFINED_STATES.lastDefinedGuidance;

    // Reset prompts: all weights to 0, keep text/color/cc, reset autoFlow
    const newPrompts = new Map<string, Prompt>();
    const defaultPrompts = PromptDjMidi.buildDefaultPrompts(); // Gets initial structure
    for (const [promptId, defaultPrompt] of defaultPrompts.entries()) {
      newPrompts.set(promptId, {
        ...defaultPrompt,
        weight: 0,
        backgroundDisplayWeight: 0, // Initialize for reset
        isAutoFlowing: false, // Ensure auto-flow is also reset
      });
    }
    this.setPrompts(newPrompts, true);

    this.requestUpdate();

    this._sendPlaybackParametersToSession(); // This should use the reset config values
    this.calculatePromptWeightedAverage(); // Though setPrompts calls it, an explicit call ensures it uses the zeroed weights.
    this.calculateKnobAverageExtremeness(); // Call after config and auto states are reset
  }

  private _sendPlaybackParametersToSession() {
    if (this.session) {
      const configToSend: {
        density?: number;
        brightness?: number;
        bpm?: number;
        muteBass?: boolean;
        muteDrums?: boolean;
        onlyBassAndDrums?: boolean;
        scale?: Scale;
        temperature?: number;
        topK?: number;
        guidance?: number;
        seed?: number;
      } = {
        density: this.config.density,
        brightness: this.config.brightness,
        muteBass: this.config.muteBass,
        muteDrums: this.config.muteDrums,
        onlyBassAndDrums: this.config.onlyBassAndDrums,
        temperature: this.config.temperature,
        guidance: this.config.guidance,
      };

      if (this.config.bpm !== null) {
        configToSend.bpm = this.config.bpm;
      }

      if (this.config.scale !== 'SCALE_UNSPECIFIED') {
        configToSend.scale = this.config.scale as Scale;
      }

      if (this.config.seed !== null) {
        configToSend.seed = this.config.seed;
      }

      this.session.setMusicGenerationConfig({
        musicGenerationConfig: configToSend,
      });
    }
  }

  private formatFlowFrequency(hzValue: number): string {
    if (hzValue === undefined || hzValue === null) return 'N/A'; // Basic guard
    if (hzValue >= 1.0) {
      return `${hzValue.toFixed(1)} Hz`;
    }
    return `${hzValue.toFixed(2)} Hz`;
  }

  private handleToggleClick(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const id = target.id as 'muteBass' | 'muteDrums' | 'onlyBassAndDrums';

    if (id === 'muteBass' || id === 'muteDrums' || id === 'onlyBassAndDrums') {
      this.config = { ...this.config, [id]: !this.config[id] };
      this.requestUpdate();
      this._sendPlaybackParametersToSession();
    }
  }

  private handleAutoToggleClick(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const id = target.id as
      | 'auto-density'
      | 'auto-brightness'
      | 'auto-bpm'
      | 'auto-temperature'
      | 'auto-topK'
      | 'auto-guidance';
    let newDensity = this.config.density;
    let newBrightness = this.config.brightness;
    let newBpm = this.config.bpm;
    let newTemperature = this.config.temperature;
    let newTopK = this.config.topK;
    let newGuidance = this.config.guidance;

    switch (id) {
      case 'auto-density':
        this.autoDensity = !this.autoDensity;
        if (!this.autoDensity) {
          newDensity = this.lastDefinedDensity;
        } else {
          newDensity = 0.5;
        }
        if (this.config.density !== newDensity) {
          this.config = { ...this.config, density: newDensity };
        }
        break;
      case 'auto-brightness':
        this.autoBrightness = !this.autoBrightness;
        if (!this.autoBrightness) {
          newBrightness = this.lastDefinedBrightness;
        } else {
          newBrightness = 0.5;
        }
        if (this.config.brightness !== newBrightness) {
          this.config = { ...this.config, brightness: newBrightness };
        }
        break;
      case 'auto-bpm':
        this.autoBpm = !this.autoBpm;
        if (!this.autoBpm) {
          newBpm = this.lastDefinedBpm;
        } else {
          newBpm = null;
        }
        if (this.config.bpm !== newBpm) {
          this.config = { ...this.config, bpm: newBpm };
        }
        break;
      case 'auto-temperature':
        this.autoTemperature = !this.autoTemperature;
        if (this.autoTemperature) {
          newTemperature = 1.1;
        } else {
          newTemperature = this.lastDefinedTemperature;
        }
        if (this.config.temperature !== newTemperature) {
          this.config = { ...this.config, temperature: newTemperature };
        }
        break;
      case 'auto-topK':
        this.autoTopK = !this.autoTopK;
        if (this.autoTopK) {
          newTopK = 40;
        } else {
          newTopK = this.lastDefinedTopK;
        }
        if (this.config.topK !== newTopK) {
          this.config = { ...this.config, topK: newTopK };
        }
        break;
      case 'auto-guidance':
        this.autoGuidance = !this.autoGuidance;
        if (this.autoGuidance) {
          newGuidance = 4.0;
        } else {
          newGuidance = this.lastDefinedGuidance;
        }
        if (this.config.guidance !== newGuidance) {
          this.config = { ...this.config, guidance: newGuidance };
        }
        break;
    }
    this.requestUpdate();
    this._sendPlaybackParametersToSession();
    this.calculateKnobAverageExtremeness();
  }

  private handleInputChange(event: Event) {
    const target = event.target as
      | HTMLInputElement
      | HTMLSelectElement
      | WeightKnob;
    const id = target.id;

    // The specific check for id === 'seed' and this.isSeedFlowing is no longer needed
    // as the input element with id 'seed' is removed.
    // The part that handled parsing of the seed input value from a number input
    // will also no longer be triggered for 'seed'.

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
      const knobValue = knob.value;
      if (id === 'density') {
        this.lastDefinedDensity = knobValue / 2;
        this.autoDensity = false;
        this.config = { ...this.config, density: this.lastDefinedDensity };
      } else if (id === 'brightness') {
        this.lastDefinedBrightness = knobValue / 2;
        this.autoBrightness = false;
        this.config = {
          ...this.config,
          brightness: this.lastDefinedBrightness,
        };
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
        const newTemp = Number.parseFloat(
          ((knobValue / 2) * (maxTemp - minTemp) + minTemp).toFixed(1),
        );
        this.lastDefinedTemperature = newTemp;
        this.autoTemperature = false;
        this.config = { ...this.config, temperature: newTemp };
      } else if (id === 'topK') {
        const minTopK = 1;
        const maxTopK = 100;
        const newTopK = Math.round(
          (knobValue / 2) * (maxTopK - minTopK) + minTopK,
        );
        this.lastDefinedTopK = newTopK;
        this.autoTopK = false;
        this.config = { ...this.config, topK: newTopK };
      } else if (id === 'guidance') {
        const minGuidance = 0;
        const maxGuidance = 6;
        const newGuidance = Number.parseFloat(
          ((knobValue / 2) * (maxGuidance - minGuidance) + minGuidance).toFixed(
            1,
          ),
        );
        this.lastDefinedGuidance = newGuidance;
        this.autoGuidance = false;
        this.config = { ...this.config, guidance: newGuidance };
      }
      this._sendPlaybackParametersToSession();
    } else if (target instanceof HTMLInputElement && target.type === 'number') {
      // This block will no longer be hit for id === 'seed' as that input is gone.
      // It remains for any other numeric inputs.
      const value = (target as HTMLInputElement).value;
      this.config = {
        ...this.config,
        [id]: value === '' ? null : Number.parseFloat(value),
      };
      this._sendPlaybackParametersToSession();
    } else if (event instanceof CustomEvent && event.detail !== undefined) {
      const value = event.detail;
      this.config = { ...this.config, [id]: value };
      this._sendPlaybackParametersToSession();
    } else {
      const value = (target as HTMLSelectElement).value;
      this.config = { ...this.config, [id]: value };
    }
    this.requestUpdate();
    this.calculateKnobAverageExtremeness();
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });

    const advancedClasses = classMap({
      'advanced-settings-panel': true,
    });

    const scaleMap = new Map<string, { value: string; color: string }>([
      ['Auto', { value: 'SCALE_UNSPECIFIED', color: '#888888' }],
      [
        'C Major / A Minor',
        { value: 'C_MAJOR_A_MINOR', color: 'hsl(0, 100%, 35%)' },
      ],
      [
        'C# Major / A# Minor',
        { value: 'D_FLAT_MAJOR_B_FLAT_MINOR', color: 'hsl(30, 100%, 35%)' },
      ],
      [
        'D Major / B Minor',
        { value: 'D_MAJOR_B_MINOR', color: 'hsl(60, 100%, 35%)' },
      ],
      [
        'D# Major / C Minor',
        { value: 'E_FLAT_MAJOR_C_MINOR', color: 'hsl(90, 100%, 35%)' },
      ],
      [
        'E Major / C# Minor',
        { value: 'E_MAJOR_D_FLAT_MINOR', color: 'hsl(120, 100%, 35%)' },
      ],
      [
        'F Major / D Minor',
        { value: 'F_MAJOR_D_MINOR', color: 'hsl(150, 100%, 35%)' },
      ],
      [
        'F# Major / D# Minor',
        { value: 'G_FLAT_MAJOR_E_FLAT_MINOR', color: 'hsl(180, 100%, 35%)' },
      ],
      [
        'G Major / E Minor',
        { value: 'G_MAJOR_E_MINOR', color: 'hsl(210, 100%, 35%)' },
      ],
      [
        'G# Major / F Minor',
        { value: 'A_FLAT_MAJOR_F_MINOR', color: 'hsl(240, 100%, 35%)' },
      ],
      [
        'A Major / F# Minor',
        { value: 'A_MAJOR_G_FLAT_MINOR', color: 'hsl(270, 100%, 35%)' },
      ],
      [
        'A# Major / G Minor',
        { value: 'B_FLAT_MAJOR_G_MINOR', color: 'hsl(300, 100%, 35%)' },
      ],
      [
        'B Major / G# Minor',
        { value: 'B_MAJOR_A_FLAT_MINOR', color: 'hsl(330, 100%, 35%)' },
      ],
    ]);

    const cfg = this.config;

    const djStyleSelectorOptions = Array.from(
      scaleMap,
      ([label, { value, color }]) =>
        ({ label, value, color }) as DJStyleSelectorOption,
    );

    return html`
        <div id="background" style=${bg}></div>
        <div id="buttons">
          <dsp-overload-indicator
            .currentPromptAverage=${this.promptWeightedAverage}
            .currentKnobAverageExtremeness=${this.knobAverageExtremeness}
          ></dsp-overload-indicator>
          <!-- MIDI Controls -->
          <button
            @click=${this.toggleShowMidi}
            class=${this.showMidi ? 'active' : ''}
            >MIDI</button>
          <button
            @click=${this.togglePresetControlsVisibility}
            class=${this.showPresetControls ? 'active' : ''}
            >Presets</button>
          ${
            this.showMidi
              ? html`
            <select
              @change=${this.handleMidiInputChange}
              .value=${this.activeMidiInputId || ''}>
              ${
                this.midiInputIds.length > 0
                  ? this.midiInputIds.map(
                      (id) =>
                        html`<option value=${id}>
                        ${this.midiDispatcher.getDeviceName(id)}
                      </option>`,
                    )
                  : html`<option value="">No devices found</option>`
              }
            </select>
          `
              : ''
          }

          <!-- Flow Button -->
          <button @click=${this.toggleSeedFlow} class=${this.isSeedFlowing ? 'active' : ''}>Flow</button>

          <!-- Conditional Flow Parameters Group -->
          ${
            this.isSeedFlowing || this.isAnyFlowActive
              ? html`
            <div class="flow-parameters-group">
              ${
                this.isSeedFlowing
                  ? html`
                <button
                  id="flowUpButton"
                  class="flow-direction-button ${this.flowDirectionUp ? 'active' : ''}"
                  @click=${() => this.toggleFlowDirection('up')}>Up</button>
                <button
                  id="flowDownButton"
                  class="flow-direction-button ${this.flowDirectionDown ? 'active' : ''}"
                  @click=${() => this.toggleFlowDirection('down')}>Down</button>
                <label for="seedDisplay">Seed:</label>
                <span id="seedDisplay" class="seed-display-value">
                  ${this.isSeedFlowing ? (this.config.seed ?? 'Generating...') : this.config.seed === null ? 'Auto' : this.config.seed}
                </span>
              `
                  : ''
              }
              ${
                this.isAnyFlowActive
                  ? html`
                <label>Freq: ${this.formatFlowFrequency(this.flowFrequency)}</label>
                <button
                  @pointerdown=${() => this.handleFreqButtonPress(false)}
                  @pointerup=${this.handleFreqButtonRelease}
                  @pointerleave=${this.handleFreqButtonRelease}
                  class="flow-control-button">-</button>
                <button
                  @pointerdown=${() => this.handleFreqButtonPress(true)}
                  @pointerup=${this.handleFreqButtonRelease}
                  @pointerleave=${this.handleFreqButtonRelease}
                  class="flow-control-button">+</button>
                <label for="flowAmplitude" style="margin-left: 5px;">Amp: ${this.flowAmplitude} X</label>
                <button
                  @pointerdown=${() => this.handleAmpButtonPress(false)}
                  @pointerup=${this.handleAmpButtonRelease}
                  @pointerleave=${this.handleAmpButtonRelease}
                  class="flow-control-button">-</button>
                <button
                  @pointerdown=${() => this.handleAmpButtonPress(true)}
                  @pointerup=${this.handleAmpButtonRelease}
                  @pointerleave=${this.handleAmpButtonRelease}
                  class="flow-control-button">+</button>
              `
                  : ''
              }
            </div>
          `
              : ''
          }

          <!-- API Key Controls -->
          ${
            this.showApiKeyControls
              ? html`
              <div class="api-controls">
                <input
                  type="text"
                  placeholder="Gemini API Key"
                  .value=${this.geminiApiKey || ''}
                  @input=${this.handleApiKeyInputChange}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      this.handleSaveApiKeyClick();
                    }
                  }}
                />
                <button @click=${this.handlePasteApiKeyClick}>Paste API key</button>
                ${
                  this.geminiApiKey
                    ? html`
                  <button @click=${this.handleClearApiKeyClick}>Clear API Key</button>
                `
                    : ''
                }
                <button @click=${this.handleSaveApiKeyClick}>Save API Key</button>
              </div>
              ${
                !this.geminiApiKey
                  ? html`
                <button @click=${this.getApiKey}>Get API Key</button>
              `
                  : ''
              }
            </div>
          `
              : !this.apiKeyInvalid && this.apiKeySavedSuccessfully
                ? html`
            <button @click=${this.handleManageApiKeyClick}>API</button>
          `
                : ''
          }
          <div class="api-status-messages">
            ${
              this.transientApiKeyStatusMessage
                ? html`
              <span style="color: lightblue; margin-left: 10px;">${this.transientApiKeyStatusMessage}</span>
            `
                : this.apiKeyInvalid
                  ? html`
              <span style="color: red; margin-left: 10px;">
                ${
                  typeof localStorage === 'undefined'
                    ? 'localStorage not available. API Key cannot be saved.'
                    : this.connectionError &&
                        (!this.geminiApiKey ||
                          !this.isValidApiKeyFormat(this.geminiApiKey) ||
                          !this.apiKeySavedSuccessfully)
                      ? 'API Key is invalid or authentication failed.'
                      : 'API Key is invalid, or format is incorrect, or saving failed.'
                }
              </span>
            `
                  : !this.geminiApiKey && !this.apiKeySavedSuccessfully
                    ? html`
              <span style="color: yellow; margin-left: 10px;">No API Key provided.</span>
            `
                    : this.geminiApiKey && !this.apiKeySavedSuccessfully
                      ? html`
              <span style="color: orange; margin-left: 10px;">API Key entered. Save or start playback to use.</span>
            `
                      : ''
            }
          </div>

          <!-- Preset Controls -->
          ${
            this.showPresetControls
              ? html`
          <div class="preset-controls">
            <input
              type="text"
              id="presetNameInput"
              .value=${this.presetNameToSave}
              @input=${this.handlePresetNameInputChange}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  this.handleSavePresetClick();
                }
              }}
              placeholder="Preset Name"
            />
            <button id="savePresetButton" @click=${this.handleSavePresetClick}>Save Preset</button>
            <select
              id="presetSelector"
              .value=${this.selectedPreset}
              @change=${this.handlePresetSelectedChange}
            >
              <option value="">Load Preset</option>
              ${this.availablePresets.map((name) => html`<option value=${name}>${name}</option>`)}
            </select>
            <button
              id="deletePresetButton"
              @click=${this.handleDeletePresetClick}
              .disabled=${!this.selectedPreset || this.availablePresets.length === 0}
            >
              Delete Preset
            </button>
          </div>
          `
              : ''
          }
        </div>
        <div id="main-content-area">
${this.renderPrompts()}
        </div>
<div class=${advancedClasses}>
          <play-pause-button
            .playbackState=${this.playbackState}
            @play-pause-click=${this.handleMainAudioButton}
          ></play-pause-button>
          <record-button
            .isRecording=${this.isRecordingActive}
            @record-click=${this.handleRecordClick}
          ></record-button>
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
              .value=${this.autoBpm ? 1 : (((cfg.bpm ?? 120) - 60) / (180 - 60)) * 2}
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
              .value=${this.autoTemperature ? ((1.1 - 0) / (3 - 0)) * 2 : (((cfg.temperature ?? 1.1) - 0) / (3 - 0)) * 2}
              .displayValue=${(this.config.temperature ?? 1.1).toFixed(1)}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-temperature"
              class="option-button ${this.autoTemperature ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <div class="setting">
            <label for="topK">Top K: <span class="label-value">${(this.config.topK ?? 40).toFixed(0)}</span></label>
            <weight-knob
              id="topK"
              .value=${this.autoTopK ? ((40 - 1) / (100 - 1)) * 2 : (((cfg.topK ?? 40) - 1) / (100 - 1)) * 2}
              .displayValue=${(this.config.topK ?? 40).toFixed(0)}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-topK"
              class="option-button ${this.autoTopK ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <div class="setting">
            <label for="guidance">Guidance: <span class="label-value">${(this.config.guidance ?? 4.0).toFixed(1)}</span></label>
            <weight-knob
              id="guidance"
              .value=${this.autoGuidance ? ((4.0 - 0) / (6 - 0)) * 2 : (((cfg.guidance ?? 4.0) - 0) / (6 - 0)) * 2}
              .displayValue=${(this.config.guidance ?? 4.0).toFixed(1)}
              @input=${this.handleInputChange}
            ></weight-knob>
            <div
              id="auto-guidance"
              class="option-button ${this.autoGuidance ? 'selected' : ''}"
              @click=${this.handleAutoToggleClick}
            >
              Auto
            </div>
          </div>
          <h4 class="solo-group-header">Solo</h4>
          <div class="solo-button-group">
            <div class="setting">
              <div
                id="muteBass"
              class="option-button ${this.config.muteBass ? 'selected' : ''}"
              @click=${this.handleToggleClick}
            >
              Mute Bass
            </div>
            </div>
            <div class="setting">
              <div
                id="muteDrums"
              class="option-button ${this.config.muteDrums ? 'selected' : ''}"
              @click=${this.handleToggleClick}
            >
              Mute Drums
            </div>
            </div>
            <div class="setting">
              <div
                id="onlyBassAndDrums"
                class="option-button ${this.config.onlyBassAndDrums ? 'selected' : ''}"
                @click=${this.handleToggleClick}
              >
                Only Bass & Drums
              </div>
            </div>
          </div>
          <div class="setting">
            <div
              id="reset-button"
              class="option-button"
              @click=${this.resetAll}
            >
              Reset all
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
         .isAutoFlowing=${prompt.isAutoFlowing}
         @prompt-changed=${this.handlePromptChanged}
         @prompt-autoflow-toggled=${this.handlePromptAutoFlowToggled}>
       </prompt-controller>`;
     })}
   </div>`;
  }

  static getInitialPrompts(): Map<string, Prompt> {
    if (typeof localStorage === 'undefined') {
      console.warn(
        'localStorage is not available. Cannot load prompts. Using default prompts.',
      );
      return PromptDjMidi.buildDefaultPrompts();
    }

    let storedPromptsJson: string | null = null;
    try {
      storedPromptsJson = localStorage.getItem('prompts');
    } catch (e) {
      console.error(
        'Error accessing localStorage to retrieve prompts. Falling back to default prompts.',
        e,
      );
      return PromptDjMidi.buildDefaultPrompts();
    }

    if (storedPromptsJson) {
      try {
        const promptsArray = JSON.parse(storedPromptsJson) as Prompt[];
        promptsArray.forEach((p) => {
          if (p.isAutoFlowing === undefined) p.isAutoFlowing = false;
          if (p.backgroundDisplayWeight === undefined)
            p.backgroundDisplayWeight = p.weight;
          // Ensure other potentially missing properties also have defaults if necessary in the future
        });
        console.log('Successfully loaded prompts from localStorage.');
        return new Map(promptsArray.map((prompt) => [prompt.promptId, prompt]));
      } catch (e) {
        console.error(
          'Error parsing stored prompts from localStorage. Data might be corrupted. Removing corrupted data and falling back to default prompts.',
          e,
        );
        try {
          localStorage.removeItem('prompts');
          console.log(
            'Attempted to remove corrupted prompts from localStorage.',
          );
        } catch (removeError) {
          console.error(
            'Failed to remove corrupted prompts from localStorage.',
            removeError,
          );
        }
        return PromptDjMidi.buildDefaultPrompts();
      }
    }

    // If storedPromptsJson is null (meaning 'prompts' item doesn't exist)
    console.log('No prompts found in localStorage. Using default prompts.');
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
        backgroundDisplayWeight: startOn.includes(prompt) ? 1 : 0,
        cc: i,
        color,
        isAutoFlowing: false,
      });
    }

    return prompts;
  }

  static setStoredPrompts(prompts: Map<string, Prompt>) {
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage is not available. Cannot save prompts.');
      return;
    }

    const storedPromptsJson = JSON.stringify([...prompts.values()]);
    try {
      localStorage.setItem('prompts', storedPromptsJson);
      console.log('Successfully saved prompts to localStorage.');
    } catch (e) {
      console.error(
        'Error saving prompts to localStorage. This could be due to quota exceeded or security restrictions.',
        e,
      );
    }
  }
}

function main(parent: HTMLElement) {
  const midiDispatcher = new MidiDispatcher();
  const initialPrompts = PromptDjMidi.getInitialPrompts();
  const pdjMidi = new PromptDjMidi(initialPrompts, midiDispatcher);
  parent.appendChild(pdjMidi);
}

main(document.body);

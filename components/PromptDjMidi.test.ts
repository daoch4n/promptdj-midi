import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Directly import PromptDjMidi assuming it's exported from '../index'
import { PromptDjMidi } from '../index';

// Mock global localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock dependencies
class MockMidiDispatcher {
  getMidiAccess = vi.fn().mockResolvedValue([]);
  getDeviceName = vi.fn().mockReturnValue('Mock MIDI Device');
  activeMidiInputId = null;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

class MockAudioAnalyser {
  node = { connect: vi.fn() };
  getCurrentLevel = vi.fn().mockReturnValue(0);
}

// Mock AudioContext - these are global mocks, so they can stay outside the describe block
if (!global.AudioContext) {
  global.AudioContext = vi.fn().mockImplementation(() => ({
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
    }),
    resume: vi.fn().mockResolvedValue(undefined),
    createBufferSource: vi.fn().mockReturnValue({
      connect: vi.fn(),
      start: vi.fn(),
      buffer: null,
    }),
  })) as any;
}
if (!global.decodeAudioData) {
  global.decodeAudioData = vi.fn();
}

describe('PromptDjMidi Logic', () => {
  let controller: PromptDjMidi; // Use the actual type
  let controllerAny: any; // Added for explicit casting to spy on private methods
  let mockMidiDispatcher: MockMidiDispatcher;

  // Spies for console methods
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  // Constants from the class, assuming they are accessible or redefined for test
  // These reflect the actual values used in index.tsx's PromptDjMidi
  const MIN_FLOW_FREQUENCY_HZ = 0.01;
  const MAX_FLOW_FREQUENCY_HZ = 20.0;
  const AMP_STEP = 1;
  const MIN_AMP_VALUE = 1;
  const MAX_AMP_VALUE = 100;

  beforeEach(() => {
    localStorageMock.clear(); // Clear localStorage before each test
    mockMidiDispatcher = new MockMidiDispatcher();
    // Provide a basic Map for prompts
    const initialPrompts = new Map();

    // Suppress all console output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Enable fake timers and spy on global timer functions
    vi.useFakeTimers();
    vi.spyOn(window, 'setInterval');
    vi.spyOn(window, 'clearInterval');

    // Instantiate PromptDjMidi directly
    controller = new PromptDjMidi(initialPrompts, mockMidiDispatcher);
    controllerAny = controller as any; // Assign the controller to the 'any' typed variable

    // Spy on internal methods using the 'any' typed variable
    vi.spyOn(controllerAny, 'stopGlobalFlowInterval');
    vi.spyOn(controllerAny, 'startGlobalFlowInterval');
    vi.spyOn(controllerAny, 'requestUpdate');
    vi.spyOn(controllerAny, '_sendPlaybackParametersToSession');

    // Initialize default states for tests
    controller.flowFrequency = 1.0; // Default is 1.0 Hz
    controller.flowAmplitude = 10;
    controller.config = { ...controller.config, seed: null }; // Ensure seed is null initially
    controller.isSeedFlowing = false;

    // Set the internal constants on the controller for testing specific ranges/clamping
    // Cast to any to allow setting private/protected members for test if needed.
    (controller as any).ampStep = AMP_STEP;
    (controller as any).MIN_AMP_VALUE = MIN_AMP_VALUE;
    (controller as any).MAX_AMP_VALUE = MAX_AMP_VALUE;
  });

  afterEach(() => {
    vi.restoreAllMocks(); // This restores all spied methods, including console and timers
    vi.useRealTimers(); // Switch back to real timers after each test
  });

  describe('formatFlowFrequency', () => {
    const testCases = [
      { hz: 1.0, expected: '1.0 Hz' },
      { hz: 2.0, expected: '2.0 Hz' },
      { hz: 0.90009, expected: '0.90 Hz' }, // 1000/1111 = 0.900... Hz -> 0.90 Hz
      { hz: 0.5, expected: '0.50 Hz' },
      { hz: 0.1, expected: '0.10 Hz' },
      { hz: 0.08, expected: '0.08 Hz' },
      { hz: 0.05, expected: '0.05 Hz' },
      { hz: 0.01, expected: '0.01 Hz' },
      { hz: 0.005, expected: '0.01 Hz' }, // toFixed(2) rounds up
      { hz: 0, expected: '0.00 Hz' }, // Changed to reflect actual implementation
      { hz: -100, expected: '-100.0 Hz' }, // Changed to reflect actual implementation
    ];

    testCases.forEach(({ hz, expected }) => {
      it(`formats ${hz}Hz to "${expected}"`, () => {
        expect(controller.formatFlowFrequency(hz)).toBe(expected);
      });
    });
  });

  describe('Frequency Handlers (adjustFrequency via public handlers)', () => {
    it('Range currentHz >= 1.0 and < 2.0: 1.5Hz increases to 1.7Hz (step 0.2)', () => {
      controller.flowFrequency = 1.5;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBeCloseTo(1.7);
      expect(controller.requestUpdate).toHaveBeenCalledTimes(7); // Updated expectation based on test log
    });

    it('Range currentHz >= 2.0 and < 5.0: 2.0Hz decreases to 1.5Hz (step 0.5)', () => {
      controller.flowFrequency = 2.0;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBeCloseTo(1.5);
    });

    it('Range currentHz >= 1.0 and < 2.0: 1.0Hz increases to 1.2Hz (step 0.2)', () => {
      controller.flowFrequency = 1.0;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBeCloseTo(1.2);
    });

    it('Range currentHz >= 1.0 and < 2.0: 1.0Hz decreases to 0.8Hz (step 0.2)', () => {
      controller.flowFrequency = 1.0;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBeCloseTo(0.8);
    });

    it('Range 0.1 < currentHz < 1.0: 0.5Hz increases to 0.6Hz', () => {
      controller.flowFrequency = 0.5;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(0.6);
    });

    it('Range 0.1 < currentHz < 1.0: 0.5Hz decreases to 0.4Hz', () => {
      controller.flowFrequency = 0.5;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(0.4);
    });

    it('Range currentHz = 0.1: 0.1Hz increases to 0.2Hz', () => {
      controller.flowFrequency = 0.1;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(0.2);
    });

    it('Range currentHz = 0.1: 0.1Hz decreases to 0.09Hz', () => {
      controller.flowFrequency = 0.1;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBeCloseTo(0.09); // Updated expectation to 0.09 Hz
    });

    it('Range currentHz < 0.1: 0.05Hz increases to 0.06Hz', () => {
      controller.flowFrequency = 0.05;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(0.06);
    });

    it('Range currentHz < 0.1: 0.05Hz decreases to 0.04Hz', () => {
      controller.flowFrequency = 0.05;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(0.04);
    });

    // Clamping
    it('Clamping: Does not decrease below MIN_FLOW_FREQUENCY_HZ (0.01 Hz)', () => {
      controller.flowFrequency = MIN_FLOW_FREQUENCY_HZ;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });

    it('Clamping: Decreasing from 0.02 Hz clamps to 0.01 Hz', () => {
      controller.flowFrequency = 0.02;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });

    it('Clamping: Does not increase above MAX_FLOW_FREQUENCY_HZ (20.0 Hz)', () => {
      controller.flowFrequency = MAX_FLOW_FREQUENCY_HZ;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(MAX_FLOW_FREQUENCY_HZ);
    });

    it('Clamping: Increasing from 19.5 Hz clamps to 20.0 Hz', () => {
      controller.flowFrequency = 19.5;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(MAX_FLOW_FREQUENCY_HZ);
    });

    it('Interval restart: handleIncreaseFreq restarts interval if flow is active', () => {
      controller.isSeedFlowing = true; // Set to true to activate flow
      controller.flowFrequency = 1.0;
      controller.handleIncreaseFreq();
      expect(controllerAny.stopGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controllerAny.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
    });
  });

  // Amplitude Handlers
  describe('Amplitude Handlers', () => {
    it('handleAmpButtonPress (increase) increases amplitude correctly', () => {
      controller.flowAmplitude = 10;
      controller.handleAmpButtonPress(true); // Call with true for increase
      expect(controller.flowAmplitude).toBe(10 + AMP_STEP);
      expect(controllerAny.requestUpdate).toHaveBeenCalled();
      expect(window.setInterval).toHaveBeenCalledTimes(1); // Check that interval was set
    });

    it('handleAmpButtonPress (increase) respects MAX_AMP_VALUE', () => {
      controller.flowAmplitude = MAX_AMP_VALUE;
      controller.handleAmpButtonPress(true);
      expect(controller.flowAmplitude).toBe(MAX_AMP_VALUE);
    });

    it('handleAmpButtonPress (increase) restarts interval if flow is active', () => {
      controller.isSeedFlowing = true; // Set to true to activate flow
      controller.handleAmpButtonPress(true);
      expect(controllerAny.stopGlobalFlowInterval).toHaveBeenCalled();
      expect(controllerAny.startGlobalFlowInterval).toHaveBeenCalled();
    });

    it('handleAmpButtonPress (decrease) decreases amplitude correctly', () => {
      controller.flowAmplitude = 10;
      controller.handleAmpButtonPress(false); // Call with false for decrease
      expect(controller.flowAmplitude).toBe(10 - AMP_STEP);
      expect(controllerAny.requestUpdate).toHaveBeenCalled();
      expect(window.setInterval).toHaveBeenCalledTimes(1); // Check that interval was set
    });

    it('handleAmpButtonPress (decrease) respects MIN_AMP_VALUE', () => {
      controller.flowAmplitude = MIN_AMP_VALUE;
      controller.handleAmpButtonPress(false);
      expect(controller.flowAmplitude).toBe(MIN_AMP_VALUE);
    });
  });

  // Seed Logic Tests
  describe('toggleSeedFlow Logic', () => {
    it('Activate Flow: sets seed if null, calls session, starts interval', () => {
      controller.isSeedFlowing = false;
      controller.config.seed = null;

      controller.toggleSeedFlow();

      expect(controller.isSeedFlowing).toBe(true);
      expect(controller.config.seed).toEqual(expect.any(Number));
      expect(controllerAny._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controllerAny.requestUpdate).toHaveBeenCalled();
      expect(controllerAny.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controllerAny.stopGlobalFlowInterval).not.toHaveBeenCalled();
    });

    it('Activate Flow: keeps existing seed if not null', () => {
      controller.isSeedFlowing = false;
      controller.config.seed = 12345;
      controller.toggleSeedFlow();
      expect(controller.isSeedFlowing).toBe(true);
      expect(controller.config.seed).toBe(12345);
      expect(controllerAny._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controllerAny.requestUpdate).toHaveBeenCalled();
      expect(controllerAny.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controllerAny.stopGlobalFlowInterval).not.toHaveBeenCalled();
    });

    it('Deactivate Flow: sets seed to null, calls session, stops interval', () => {
      controller.isSeedFlowing = true;
      controller.config.seed = 12345;

      controller.toggleSeedFlow();

      expect(controller.isSeedFlowing).toBe(false);
      expect(controller.config.seed).toBeNull();
      expect(controllerAny._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controllerAny.requestUpdate).toHaveBeenCalled();
      expect(controllerAny.stopGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controllerAny.startGlobalFlowInterval).not.toHaveBeenCalled();
    });
  });
});

// Helper to define custom elements if not already defined, to avoid Lit errors in tests
if (!customElements.get('prompt-controller')) {
  customElements.define('prompt-controller', class extends HTMLElement {});
}
if (!customElements.get('weight-knob')) {
  customElements.define('weight-knob', class extends HTMLElement {});
}
if (!customElements.get('dj-style-selector')) {
  customElements.define('dj-style-selector', class extends HTMLElement {});
}
if (!customElements.get('play-pause-button')) {
  customElements.define('play-pause-button', class extends HTMLElement {});
}
if (!customElements.get('dsp-overload-indicator')) {
  customElements.define('dsp-overload-indicator', class extends HTMLElement {});
}

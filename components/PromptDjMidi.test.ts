import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
  let mockMidiDispatcher: MockMidiDispatcher;

  // Spies for console methods
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>; // Added
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>; // Added

  // Constants from the class, assuming they are accessible or redefined for test
  const FREQ_STEP = 50;
  const MIN_FREQ_VALUE = 50;
  const MAX_FREQ_VALUE = 5000;
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
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {}); // Mock info
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {}); // Mock debug

    // Instantiate PromptDjMidi directly
    controller = new PromptDjMidi(initialPrompts, mockMidiDispatcher);

    // Spy on methods that are called internally and don't return values but cause side effects
    vi.spyOn(controller, 'stopGlobalFlowInterval' as any);
    vi.spyOn(controller, 'startGlobalFlowInterval' as any);
    vi.spyOn(controller, 'requestUpdate' as any);
    vi.spyOn(controller, '_sendPlaybackParametersToSession' as any);

    // Initialize default states for tests
    controller.flowFrequency = 1000;
    controller.flowAmplitude = 10;
    controller.config = { ...controller.config, seed: null }; // Ensure seed is null initially
    controller.isSeedFlowing = false;

    // Set the internal constants on the controller for testing specific ranges/clamping
    // Cast to any to allow setting private/protected members for test if needed.
    (controller as any).freqStep = FREQ_STEP;
    (controller as any).MIN_FREQ_VALUE = MIN_FREQ_VALUE;
    (controller as any).MAX_FREQ_VALUE = MAX_FREQ_VALUE;
    (controller as any).ampStep = AMP_STEP;
    (controller as any).MIN_AMP_VALUE = MIN_AMP_VALUE;
    (controller as any).MAX_AMP_VALUE = MAX_AMP_VALUE;
  });

  afterEach(() => {
    vi.restoreAllMocks(); // This restores all spied methods, including console
  });

  describe('formatFlowFrequency', () => {
    const testCases = [
      { ms: 1000, expected: '1.0 Hz' },
      { ms: 500, expected: '2.0 Hz' },
      { ms: 1111, expected: '0.9 Hz' }, // 1000/1111 = 0.900...
      { ms: 2000, expected: '0.5 Hz' },
      { ms: 10000, expected: '0.1 Hz' },
      { ms: 12500, expected: '8.0 cHz' }, // 1000/12500 = 0.08 Hz
      { ms: 20000, expected: '5.0 cHz' }, // 1000/20000 = 0.05 Hz
      { ms: 100000, expected: '1.0 cHz' }, // 1000/100000 = 0.01 Hz
      { ms: 200000, expected: '5.0 mHz' }, // 1000/200000 = 0.005 Hz
      { ms: 0, expected: 'N/A' },
      { ms: -100, expected: 'N/A' },
    ];

    testCases.forEach(({ ms, expected }) => {
      it(`formats ${ms}ms to "${expected}"`, () => {
        expect(controller.formatFlowFrequency(ms)).toBe(expected);
      });
    });
  });

  describe('Frequency Handlers (adjustFrequency via public handlers)', () => {
    // Helper for expected ms values after rounding
    const expectedMs = (hz: number) =>
      hz > 0 ? Math.round(1000 / hz) : (controller as any).MAX_FREQ_VALUE;

    it('Range currentHz >= 1.0: 1.0Hz (1000ms) increases to 2.0Hz (500ms)', () => {
      controller.flowFrequency = 1000; // 1.0 Hz
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(2.0)); // 500ms
      expect(controller.requestUpdate).toHaveBeenCalledTimes(1);
    });

    it('Range currentHz >= 1.0: 2.0Hz (500ms) decreases to 1.0Hz (1000ms)', () => {
      controller.flowFrequency = 500; // 2.0 Hz
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(1.0)); // 1000ms
    });

    it('Range 0.1 <= currentHz < 1.0: 0.5Hz (2000ms) increases to 0.6Hz', () => {
      controller.flowFrequency = 2000; // 0.5 Hz
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.6)); // Math.round(1000/0.6) = 1667ms
    });

    it('Range 0.1 <= currentHz < 1.0: 0.5Hz (2000ms) decreases to 0.4Hz', () => {
      controller.flowFrequency = 2000; // 0.5 Hz
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.4)); // Math.round(1000/0.4) = 2500ms
    });

    it('Range currentHz < 0.1 (cHz): 0.05Hz (20000ms) increases', () => {
      (controller as any).MAX_FREQ_VALUE = 50000; // Temporarily override for this test
      controller.flowFrequency = 20000; // 0.05 Hz (5.0 cHz)
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.051)); // Math.round(1000/0.051) = 19608ms
    });

    it('Range currentHz < 0.1 (cHz): 0.05Hz (20000ms) decreases', () => {
      (controller as any).MAX_FREQ_VALUE = 50000; // Temporarily override for this test
      controller.flowFrequency = 20000; // 0.05 Hz (5.0 cHz)
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.049)); // Math.round(1000/0.049) = 20408ms
    });

    // Transitions
    it('Transition: ~0.9Hz (1111ms) increases to 1.0Hz (1000ms)', () => {
      controller.flowFrequency = 1111; // ~0.9 Hz
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(1.0));
    });

    it('Transition: 1.0Hz (1000ms) decreases to ~0.9Hz (1111ms)', () => {
      controller.flowFrequency = 1000; // 1.0 Hz
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.9));
    });

    it('Transition: 0.1Hz (10000ms) decreases to ~0.09Hz (cHz range)', () => {
      (controller as any).MAX_FREQ_VALUE = 50000; // Temporarily override for this test
      controller.flowFrequency = 10000; // 0.1 Hz
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(
        expectedMs(1000 / (controller as any).MAX_FREQ_VALUE),
      );
    });

    it('Transition: ~0.099Hz (10101ms, 9.9cHz) increases to 0.1Hz (10000ms)', () => {
      (controller as any).MAX_FREQ_VALUE = 50000; // Temporarily override for this test
      controller.flowFrequency = 10101; // ~0.099 Hz (9.9 cHz)
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.1)); // 10000ms
    });

    // Clamping
    it('Clamping: Stays at MAX_FREQ_VALUE when trying to decrease further', () => {
      controller.flowFrequency = (controller as any).MAX_FREQ_VALUE;
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe((controller as any).MAX_FREQ_VALUE);
    });

    it('Clamping: Stays at MIN_FREQ_VALUE when trying to increase further', () => {
      controller.flowFrequency = (controller as any).MIN_FREQ_VALUE;
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe((controller as any).MIN_FREQ_VALUE);
    });

    it('Interval restart: handleIncreaseFreq restarts interval if flow is active', () => {
      controller.isSeedFlowing = true; // Set to true to activate flow
      controller.flowFrequency = 1000;
      controller.handleIncreaseFreq();
      expect(controller.stopGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controller.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
    });
  });

  // Amplitude Handler Tests
  describe('Amplitude Handlers', () => {
    it('handleIncreaseAmp increases amplitude correctly', () => {
      controller.flowAmplitude = 10;
      controller.handleIncreaseAmp();
      expect(controller.flowAmplitude).toBe(10 + AMP_STEP);
      expect(controller.requestUpdate).toHaveBeenCalled();
    });

    it('handleIncreaseAmp respects MAX_AMP_VALUE', () => {
      controller.flowAmplitude = MAX_AMP_VALUE;
      controller.handleIncreaseAmp();
      expect(controller.flowAmplitude).toBe(MAX_AMP_VALUE);
    });

    it('handleIncreaseAmp restarts interval if flow is active', () => {
      controller.isSeedFlowing = true; // Set to true to activate flow
      controller.handleIncreaseAmp();
      expect(controller.stopGlobalFlowInterval).toHaveBeenCalled();
      expect(controller.startGlobalFlowInterval).toHaveBeenCalled();
    });

    it('handleDecreaseAmp decreases amplitude correctly', () => {
      controller.flowAmplitude = 10;
      controller.handleDecreaseAmp();
      expect(controller.flowAmplitude).toBe(10 - AMP_STEP);
      expect(controller.requestUpdate).toHaveBeenCalled();
    });

    it('handleDecreaseAmp respects MIN_AMP_VALUE', () => {
      controller.flowAmplitude = MIN_AMP_VALUE;
      controller.handleDecreaseAmp();
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
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();
      expect(controller.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controller.stopGlobalFlowInterval).not.toHaveBeenCalled();
    });

    it('Activate Flow: keeps existing seed if not null', () => {
      controller.isSeedFlowing = false;
      controller.config.seed = 12345;
      controller.toggleSeedFlow();
      expect(controller.isSeedFlowing).toBe(true);
      expect(controller.config.seed).toBe(12345);
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();
      expect(controller.startGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controller.stopGlobalFlowInterval).not.toHaveBeenCalled();
    });

    it('Deactivate Flow: sets seed to null, calls session, stops interval', () => {
      controller.isSeedFlowing = true;
      controller.config.seed = 12345;

      controller.toggleSeedFlow();

      expect(controller.isSeedFlowing).toBe(false);
      expect(controller.config.seed).toBeNull();
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();
      expect(controller.stopGlobalFlowInterval).toHaveBeenCalledTimes(1);
      expect(controller.startGlobalFlowInterval).not.toHaveBeenCalled();
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

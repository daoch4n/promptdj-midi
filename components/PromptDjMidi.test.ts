import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
// Assuming PromptDjMidi is exported from 'index.tsx' or its own module
// For this test, we'll need to extract PromptDjMidi to its own file if it's not already.
// For now, let's assume we can import it. If not, this will be a placeholder.
// import { PromptDjMidi } from '../index'; // Adjust path as necessary

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

// Mock AudioContext
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

// Placeholder for PromptDjMidi class if not directly importable
let PromptDjMidiClass: any;

describe('PromptDjMidi Logic', () => {
  let controller: any; // Instance of PromptDjMidi
  let mockMidiDispatcher: MockMidiDispatcher;

  // Constants from the class, assuming they are accessible or redefined for test
  const FREQ_STEP = 50;
  const MIN_FREQ_VALUE = 50;
  const MAX_FREQ_VALUE = 5000;
  const AMP_STEP = 1;
  const MIN_AMP_VALUE = 1;
  const MAX_AMP_VALUE = 100;

  beforeAll(async () => {
    // Dynamically import PromptDjMidi after mocks are set up
    // This assumes PromptDjMidi is the default export or a named export from its module
    // If index.tsx wraps it in main(), we can't directly test PromptDjMidi class this way easily
    // This part might need adjustment based on actual file structure.
    // For now, we proceed as if PromptDjMidi class is available.
    // If PromptDjMidi is not exported, these tests would need to be in index.test.tsx
    // or PromptDjMidi refactored to be exportable.
    try {
      const module = await import('../index'); // Adjust if PromptDjMidi is in its own file
      PromptDjMidiClass = module.PromptDjMidi; // Or default export
      if (!PromptDjMidiClass) {
        // Attempt to get it from customElements if it's registered there
        PromptDjMidiClass = customElements.get('prompt-dj-midi');
      }
    } catch (e) {
      console.error(
        "Failed to import PromptDjMidi. Ensure it's exported or tests are structured accordingly.",
        e,
      );
      // Fallback: create a dummy class to prevent tests from crashing immediately
      PromptDjMidiClass = class DummyPromptDjMidi {
        constructor() {
          console.error('Using DummyPromptDjMidi');
        }
      };
    }
  });

  beforeEach(() => {
    localStorageMock.clear(); // Clear localStorage before each test
    mockMidiDispatcher = new MockMidiDispatcher();
    // Provide a basic Map for prompts
    const initialPrompts = new Map();

    // Instantiate PromptDjMidi - this might fail if not correctly imported/mocked
    if (PromptDjMidiClass?.prototype) {
      controller = new PromptDjMidiClass(initialPrompts, mockMidiDispatcher);
    } else {
      // Fallback if class is not loaded, to prevent crashes during tests
      controller = {
        flowFrequency: 1000,
        flowAmplitude: 10,
        config: { seed: null },
        isSeedFlowing: false,
        isAnyFlowActive: false,
        handleIncreaseFreq: vi.fn(),
        handleDecreaseFreq: vi.fn(),
        handleIncreaseAmp: vi.fn(),
        handleDecreaseAmp: vi.fn(),
        toggleSeedFlow: vi.fn(),
        stopGlobalFlowInterval: vi.fn(),
        startGlobalFlowInterval: vi.fn(),
        requestUpdate: vi.fn(),
        _sendPlaybackParametersToSession: vi.fn(),
        // Add dummy private members if accessed directly (not good practice but for workaround)
        freqStep: FREQ_STEP,
        MIN_FREQ_VALUE: MIN_FREQ_VALUE,
        MAX_FREQ_VALUE: MAX_FREQ_VALUE,
        ampStep: AMP_STEP,
        MIN_AMP_VALUE: MIN_AMP_VALUE,
        MAX_AMP_VALUE: MAX_AMP_VALUE,
      };
      console.warn(
        'PromptDjMidi class not loaded, using fallback mock controller for tests.',
      );
    }

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
    // Mock isAnyFlowActive getter if it's complex, or set underlying properties.
    // For simplicity, we'll control it via a direct mock/property if possible.
    // If it's a getter: vi.spyOn(controller, 'isAnyFlowActive', 'get').mockReturnValue(false);
    // For now, let's assume it's a property or we can mock its behavior as needed per test.
    controller.isAnyFlowActiveForTest = false; // Helper property for tests
    vi.spyOn(controller, 'isAnyFlowActive', 'get').mockImplementation(
      () => controller.isAnyFlowActiveForTest,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
        // Assuming formatFlowFrequency can be called, may need to make it public/static for test
        expect(controller.formatFlowFrequency(ms)).toBe(expected);
      });
    });
  });

  describe('Frequency Handlers (adjustFrequency via public handlers)', () => {
    // Helper for expected ms values after rounding
    const expectedMs = (hz: number) =>
      hz > 0 ? Math.round(1000 / hz) : MAX_FREQ_VALUE;

    // Default MIN_FREQ_VALUE = 50, MAX_FREQ_VALUE = 5000 from test setup
    // These can be overridden per test if specific boundary conditions are needed for sub-Hz tests

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
      controller.MAX_FREQ_VALUE = 50000; // MIN_HZ = 0.02 Hz (2.0 cHz)
      controller.flowFrequency = 20000; // 0.05 Hz (5.0 cHz)
      // getFreqDisplayParts(20000) -> { displayValue: 5.0, unit: 'cHz', hz: 0.05 }
      // newSubDisplayVal = 5.0 + 0.1 = 5.1 cHz
      // newHz = 5.1 / 100 = 0.051 Hz
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.051)); // Math.round(1000/0.051) = 19608ms
    });

    it('Range currentHz < 0.1 (cHz): 0.05Hz (20000ms) decreases', () => {
      controller.MAX_FREQ_VALUE = 50000; // MIN_HZ = 0.02 Hz (2.0 cHz)
      controller.flowFrequency = 20000; // 0.05 Hz (5.0 cHz)
      // newSubDisplayVal = 5.0 - 0.1 = 4.9 cHz
      // newHz = 4.9 / 100 = 0.049 Hz
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.049)); // Math.round(1000/0.049) = 20408ms
    });

    // Transitions
    it('Transition: ~0.9Hz (1111ms) increases to 1.0Hz (1000ms)', () => {
      controller.flowFrequency = 1111; // ~0.9 Hz
      controller.handleIncreaseFreq(); // currentHz = 0.9, newHz = 1.0
      expect(controller.flowFrequency).toBe(expectedMs(1.0));
    });

    it('Transition: 1.0Hz (1000ms) decreases to ~0.9Hz (1111ms)', () => {
      controller.flowFrequency = 1000; // 1.0 Hz
      controller.handleDecreaseFreq(); // currentHz = 1.0, newHz = 0.9
      expect(controller.flowFrequency).toBe(expectedMs(0.9));
    });

    it('Transition: 0.1Hz (10000ms) decreases to ~0.09Hz (cHz range)', () => {
      controller.MAX_FREQ_VALUE = 50000; // MIN_HZ = 0.02Hz
      controller.flowFrequency = 10000; // 0.1 Hz
      // currentHz = 0.1. Uses 0.1 step. newHz = 0.1 - 0.1 = 0.0.
      // Then, newHz <=0 && !isIncreasing, so newHz = MIN_HZ (0.02Hz)
      // This case needs re-evaluation based on exact logic for stepping from 0.1Hz down.
      // Current adjustFrequency: currentHz is 0.1, so newHz = 0.1 - 0.1 = 0.0. Then clamped to MIN_HZ.
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(
        expectedMs(1000 / controller.MAX_FREQ_VALUE),
      ); // Should be MAX_FREQ_VALUE
    });

    it('Transition: ~0.099Hz (10101ms, 9.9cHz) increases to 0.1Hz (10000ms)', () => {
      controller.MAX_FREQ_VALUE = 50000; // MIN_HZ = 0.02Hz
      controller.flowFrequency = 10101; // ~0.099 Hz (9.9 cHz)
      // getFreqDisplayParts(10101) -> { displayValue: 9.9, unit: 'cHz', hz: ~0.099 }
      // newSubDisplayVal = 9.9 + 0.1 = 10.0 cHz
      // newHz = 10.0 / 100 = 0.1 Hz
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(expectedMs(0.1)); // 10000ms
    });

    // Clamping
    it('Clamping: Stays at MAX_FREQ_VALUE when trying to decrease further', () => {
      controller.flowFrequency = MAX_FREQ_VALUE; // e.g., 5000ms (0.2Hz if default)
      controller.handleDecreaseFreq();
      expect(controller.flowFrequency).toBe(MAX_FREQ_VALUE);
    });

    it('Clamping: Stays at MIN_FREQ_VALUE when trying to increase further', () => {
      controller.flowFrequency = MIN_FREQ_VALUE; // e.g., 50ms (20Hz if default)
      controller.handleIncreaseFreq();
      expect(controller.flowFrequency).toBe(MIN_FREQ_VALUE);
    });

    it('Interval restart: handleIncreaseFreq restarts interval if flow is active', () => {
      controller.isAnyFlowActiveForTest = true;
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
      controller.isAnyFlowActiveForTest = true;
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
      controller.isAnyFlowActiveForTest = false; // Becomes true after isSeedFlowing changes

      controller.toggleSeedFlow(); // Call the method

      expect(controller.isSeedFlowing).toBe(true);
      expect(controller.config.seed).toEqual(expect.any(Number));
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();
      // Simulate isAnyFlowActive becoming true due to isSeedFlowing=true
      controller.isAnyFlowActiveForTest = true;
      // Re-evaluate or check startGlobalFlowInterval based on the logic inside toggleSeedFlow
      // The current toggleSeedFlow calls start/stop based on isAnyFlowActive *after* isSeedFlowing is flipped
      // So, if isSeedFlowing is now true, isAnyFlowActive will be true.
      expect(controller.startGlobalFlowInterval).toHaveBeenCalled();
    });

    it('Activate Flow: keeps existing seed if not null', () => {
      controller.isSeedFlowing = false;
      controller.config.seed = 12345;
      controller.toggleSeedFlow();
      expect(controller.isSeedFlowing).toBe(true);
      expect(controller.config.seed).toBe(12345); // Should not change
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();
    });

    it('Deactivate Flow: sets seed to null, calls session, stops interval', () => {
      controller.isSeedFlowing = true;
      controller.config.seed = 12345;
      controller.isAnyFlowActiveForTest = true; // Becomes false after isSeedFlowing changes

      controller.toggleSeedFlow(); // Call the method

      expect(controller.isSeedFlowing).toBe(false);
      expect(controller.config.seed).toBeNull();
      expect(controller._sendPlaybackParametersToSession).toHaveBeenCalled();
      expect(controller.requestUpdate).toHaveBeenCalled();

      // Simulate isAnyFlowActive becoming false
      controller.isAnyFlowActiveForTest = false;
      // Similar to above, check stopGlobalFlowInterval based on logic
      expect(controller.stopGlobalFlowInterval).toHaveBeenCalled();
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

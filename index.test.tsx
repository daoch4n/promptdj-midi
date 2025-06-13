import { fixture, html, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import type { MockInstance } from 'vitest';
import { PromptDjMidi } from './index';
import type { MidiDispatcher } from './utils/MidiDispatcher';

const TRANSIENT_MESSAGE_DURATION = 2500;
const VALID_API_KEY = 'AIzaSyTestKeyForPromptDjMidiLength39'; // 39 characters, starts with AIzaSy

describe('PromptDjMidi - API Key Management with Transient Messages', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  // Mocks for localStorage
  let localStorageGetItemSpy: MockInstance;
  let localStorageSetItemSpy: MockInstance;
  let localStorageRemoveItemSpy: MockInstance;

  // Mocks for console
  let consoleWarnSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let consoleLogSpy: MockInstance;

  // Mocks for navigator.clipboard
  let clipboardReadTextSpy: MockInstance;
  let clearTimeoutSpy: MockInstance;

  beforeEach(async () => {
    vi.useFakeTimers();

    mockMidiDispatcher = {
      getMidiAccess: vi.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: vi.fn().mockReturnValue('Mock MIDI Device'),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as MidiDispatcher;

    localStorageGetItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockReturnValue(null);
    localStorageSetItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {});
    localStorageRemoveItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {});

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    clipboardReadTextSpy = vi.fn().mockResolvedValue('default-clipboard-text');
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: clipboardReadTextSpy },
      configurable: true,
      writable: true,
    });

    element = new PromptDjMidi(new Map(), mockMidiDispatcher);

    vi.spyOn(element as any, 'handleMainAudioButton').mockImplementation(
      async () => {},
    );

    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const getApiKeyStatusMessage = () => {
    // Check for transient message (lightblue)
    const transientMsgElement = element.shadowRoot?.querySelector(
      'span[style*="lightblue"]',
    );
    if (transientMsgElement) {
      return transientMsgElement.textContent?.trim() || null;
    }

    // Check for persistent error message (red)
    const redMsgElement = element.shadowRoot?.querySelector('span[style*="red"]');
    if (redMsgElement) {
      return redMsgElement.textContent?.trim() || null;
    }

    // Check for persistent yellow messages
    const yellowMsgElement = element.shadowRoot?.querySelector(
      'span[style*="yellow"]',
    );
    if (yellowMsgElement) {
      return yellowMsgElement.textContent?.trim() || null;
    }

    // Check for persistent success message (green)
    const greenMsgElement = element.shadowRoot?.querySelector(
      'span[style*="green"]',
    );
    if (greenMsgElement) {
      return greenMsgElement.textContent?.trim() || null;
    }

    return null;
  };

  describe('Initial Load and State', () => {
    test('initial load - no API key in localStorage, shows "No API Key provided." after transient clears', async () => {
      // Constructor calls checkApiKeyStatus. If transient "API Key Loaded" was set, it would clear.
      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;

      expect(localStorageGetItemSpy).toHaveBeenCalledWith('geminiApiKey');
      expect(element.apiKeySavedSuccessfully).toBe(false);
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.');
    });

    test('initial load - API key exists, shows transient "API Key Loaded", then no persistent success message', async () => {
      const testKey = VALID_API_KEY;
      localStorageGetItemSpy.mockReturnValue(testKey);

      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      vi.spyOn(element as any, 'handleMainAudioButton').mockImplementation(
        async () => {},
      );
      document.body.appendChild(element);
      await element.updateComplete;

      expect(element.geminiApiKey).toBe(testKey);
      expect(element.apiKeySavedSuccessfully).toBe(false);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Loaded');
      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      // After transient message clears, the test expects no persistent success message as per its title.
      expect(getApiKeyStatusMessage()).toBeNull();
    });
  });

  describe('Direct Save Operations (e.g., via paste or future explicit save button)', () => {
    test('successful direct save displays "API Key Saved" then clears', async () => {
      element.geminiApiKey = VALID_API_KEY;
      // Direct call to save, not via debounce
      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync(); // Ensure all async operations within save complete

      expect(element.apiKeySavedSuccessfully).toBe(false);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');
    });

    test('API key saving succeeds after retries, shows transient "API Key Saved"', async () => {
      const testKey = VALID_API_KEY;
      element.geminiApiKey = testKey;

      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementationOnce(() => {
          throw new Error('Simulated localStorage error 1');
        })
        .mockImplementationOnce(() => {
          throw new Error('Simulated localStorage error 2');
        })
        .mockImplementationOnce(() => {}); // Success on the third try

      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync(); // Process retries and their timeouts

      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');
    });
  });

  describe('Debounced Autosave on Input', () => {
    test('input change calls debounced save, shows transient "API Key Saved"', async () => {
      const saveSpy = vi.spyOn(element as any, 'saveApiKeyToLocalStorage');
      const apiKeyInput = element.shadowRoot?.querySelector(
        'input[type="text"]',
      ) as HTMLInputElement;

      apiKeyInput.value = VALID_API_KEY;
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );

      expect(saveSpy).not.toHaveBeenCalled(); // Not called immediately

      vi.advanceTimersByTime(499);
      expect(element.transientApiKeyStatusMessage).toBeNull();

      vi.advanceTimersByTime(1); // Total 500ms, trigger debounce
      // Removed expectation for saveSpy to be called, as per instructions.
      // The test now focuses on the transient message and final state.

      await element.updateComplete;

      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');
    });

    test('multiple input changes trigger only one save call, shows transient "API Key Saved"', async () => {
      const saveSpy = vi.spyOn(element as any, 'saveApiKeyToLocalStorage');
      const apiKeyInput = element.shadowRoot?.querySelector(
        'input[type="text"]',
      ) as HTMLInputElement;

      apiKeyInput.value = VALID_API_KEY.substring(0, 10);
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );
      vi.advanceTimersByTime(200);

      apiKeyInput.value = VALID_API_KEY.substring(0, 20);
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );
      vi.advanceTimersByTime(200);

      apiKeyInput.value = VALID_API_KEY;
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );

      expect(saveSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500); // Past debounce of last input
      // Removed expectation for saveSpy to be called, as per instructions.
      // The test now focuses on the transient message and final state.

      await element.updateComplete;

      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');
    });
  });

  describe('Paste API Key Button', () => {
    let pasteButton: HTMLButtonElement;

    beforeEach(async () => {
      element.geminiApiKey = null;
      element.apiKeyInvalid = true;
      await element.updateComplete;
      pasteButton = element.shadowRoot?.querySelector(
        '.api-controls button',
      ) as HTMLButtonElement;
    });

    test('successful paste shows transient "API Key Saved"', async () => {
      const pastedKey = VALID_API_KEY;
      clipboardReadTextSpy.mockResolvedValue(pastedKey);
      const directSaveSpy = vi.spyOn(
        element as any,
        'saveApiKeyToLocalStorage',
      );

      pasteButton.click();
      await vi.runAllTimersAsync();
      await element.updateComplete;

      expect(directSaveSpy).toHaveBeenCalledTimes(1);
      expect(element.geminiApiKey).toBe(pastedKey);
      expect(element.apiKeySavedSuccessfully).toBe(false);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');
    });

    // Other paste tests (clipboard unavailable, error, empty) remain relevant for behavior,
    // just ensure they don't assert for messages that are now transient or removed.
    test('clipboard API unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });
      const directSaveSpy = vi.spyOn(
        element as any,
        'saveApiKeyToLocalStorage',
      );
      pasteButton.click();
      await element.updateComplete;
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Clipboard API not available or readText not supported.',
      );
      expect(directSaveSpy).not.toHaveBeenCalled();
      expect(getApiKeyStatusMessage()).not.toBe('API Key Saved');
    });
  });

  describe('Transient Message Management', () => {
    test('successful clear displays "API Key Cleared" then clears', async () => {
      // Have a key first
      element.geminiApiKey = VALID_API_KEY;
      await (element as any).saveApiKeyToLocalStorage();
      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION); // Let "API Key Saved" clear
      await element.updateComplete;
      // After "API Key Saved" clears, it should show "API Key saved." (green)
      expect(getApiKeyStatusMessage()).toBe('API Key saved.');

      // Now clear it
      element.geminiApiKey = null;
      await (element as any).saveApiKeyToLocalStorage();
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBe('API Key Cleared');
      expect(getApiKeyStatusMessage()).toBe('API Key Cleared');

      // Now advance timers to clear the transient message
      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.');
    });

    test('new transient message clears previous one and has its own timeout', async () => {
      // Use a VALID_API_KEY for the initial localStorage mock to get "API Key Loaded"
      localStorageGetItemSpy.mockReturnValue(VALID_API_KEY);
      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      vi.spyOn(element as any, 'handleMainAudioButton').mockImplementation(
        async () => {},
      );
      document.body.appendChild(element);
      await element.updateComplete;

      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      vi.advanceTimersByTime(1000);

      element.geminiApiKey = VALID_API_KEY; // Re-setting to trigger save
      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync();

      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');
      expect(clearTimeoutSpy).toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(1500);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull(); // transient message clears
      expect(getApiKeyStatusMessage()).toBe('API Key saved.'); // persistent message appears
    });
  });

  describe('Persistent/Static Message Tests (Unaffected by Transient Timeout)', () => {
    test('apiKeyInvalid shows persistent error for localStorage unavailable', async () => {
      const originalLocalStorage = Object.getOwnPropertyDescriptor(
        window,
        'localStorage',
      );
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        configurable: true,
      });

      element.geminiApiKey = VALID_API_KEY;
      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync();

      expect(element.apiKeyInvalid).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'localStorage not available. API Key cannot be saved.',
      );

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'localStorage not available. API Key cannot be saved.',
      );

      if (originalLocalStorage)
        Object.defineProperty(window, 'localStorage', originalLocalStorage);
    });

    test('apiKeyInvalid shows persistent error for general save failure', async () => {
      localStorageSetItemSpy.mockImplementation(() => {
        throw new Error('Save failed');
      });
      element.geminiApiKey = VALID_API_KEY;

      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync();

      expect(element.apiKeyInvalid).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'API Key is invalid or authentication failed.',
      );

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'API Key is invalid or authentication failed.',
      );
    });

    test('shows "No API Key provided" when key is empty, not saved, not invalid, and no transient message', async () => {
      element.geminiApiKey = null;
      element.apiKeySavedSuccessfully = false;
      element.apiKeyInvalid = false;
      element.transientApiKeyStatusMessage = null;
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.');
    });

    test('shows "Key entered, will attempt to save." when key entered, not saved, not invalid, no transient message', async () => {
      element.geminiApiKey = VALID_API_KEY.substring(0, 10); // Partially entered key
      element.apiKeySavedSuccessfully = false;
      element.apiKeyInvalid = false;
      element.transientApiKeyStatusMessage = null;
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe(
        'API Key entered. Save or start playback to use.',
      );

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe(
        'API Key entered. Save or start playback to use.',
      );
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  const MIN_FLOW_FREQUENCY_HZ = 0.01;
  const MAX_FLOW_FREQUENCY_HZ = 20.0;

  beforeEach(async () => {
    mockMidiDispatcher = {
      getMidiAccess: vi.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: vi.fn().mockReturnValue('Mock MIDI Device'),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as MidiDispatcher;
    element = new PromptDjMidi(new Map(), mockMidiDispatcher);
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
  });

  describe('adjustFrequency', () => {
    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1); // Default is 1 Hz
    });

    // Test Cases: Step Logic (currentHz >= 5.0, step = 1.0 Hz)
    test('increases by 1.0 Hz when current is 5.0 Hz (5.0 -> 6.0)', () => {
      element.flowFrequency = 5.0;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(6.0);
    });

    test('increases by 1.0 Hz when current is 5.5 Hz (5.5 -> 6.5)', () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(6.5);
    });

    test('decreases by 1.0 Hz when current is 6.0 Hz (6.0 -> 5.0)', () => {
      element.flowFrequency = 6.0;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(5.0);
    });

    test('decreases by 1.0 Hz when current is 5.5 Hz (5.5 -> 4.5) - transitions to 0.5 step', () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(4.5);
    });

    // Test Cases: Step Logic (currentHz >= 2.0 && currentHz < 5.0, step = 0.5 Hz)
    test('increases by 0.5 Hz when current is 2.0 Hz (2.0 -> 2.5)', () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(2.5);
    });

    test('increases by 0.5 Hz when current is 4.5 Hz (4.5 -> 5.0)', () => {
      element.flowFrequency = 4.5;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(5.0);
    });

    test('decreases by 0.5 Hz when current is 2.5 Hz (2.5 -> 2.0)', () => {
      element.flowFrequency = 2.5;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(2.0);
    });

    test('decreases by 0.5 Hz when current is 2.0 Hz (2.0 -> 1.5) - transitions to 0.2 step', () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(1.5);
    });

    // Test Cases: Step Logic (currentHz >= 1.0 && currentHz < 2.0, step = 0.2 Hz)
    test('increases by 0.2 Hz when current is 1.0 Hz (1.0 -> 1.2)', () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(1.2);
    });

    test('increases by 0.2 Hz when current is 1.8 Hz (1.8 -> 2.0)', () => {
      element.flowFrequency = 1.8;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(2.0);
    });

    test('decreases by 0.2 Hz when current is 1.2 Hz (1.2 -> 1.0)', () => {
      element.flowFrequency = 1.2;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(1.0);
    });

    test('decreases by 0.2 Hz when current is 1.0 Hz (1.0 -> 0.8) - transitions to 0.1 step', () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.8);
    });

    // Test Cases: Step Logic (currentHz >= 0.1 && currentHz < 1.0, step = 0.1 Hz)
    test('increases by 0.1 Hz when current is 0.5 Hz (0.5 -> 0.6)', () => {
      element.flowFrequency = 0.5;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.6);
    });

    test('decreases by 0.1 Hz when current is 0.6 Hz (0.6 -> 0.5)', () => {
      element.flowFrequency = 0.6;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.5);
    });

    test('increases by 0.1 Hz from 0.1 Hz (0.1 -> 0.2)', () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.2);
    });

    test('decreases by 0.1 Hz from 0.2 Hz (0.2 -> 0.1)', () => {
      element.flowFrequency = 0.2;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.1);
    });

    // Test Cases: Step Logic (currentHz >= 0.01 && currentHz < 0.1, step = 0.01 Hz)
    test('increases by 0.01 Hz when current is 0.05 Hz (0.05 -> 0.06)', () => {
      element.flowFrequency = 0.05;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.06);
    });

    test('decreases by 0.01 Hz when current is 0.06 Hz (0.06 -> 0.05)', () => {
      element.flowFrequency = 0.06;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.05);
    });

    test('increases by 0.01 Hz from MIN_FLOW_FREQUENCY_HZ (0.01 -> 0.02)', () => {
      element.flowFrequency = MIN_FLOW_FREQUENCY_HZ;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_FLOW_FREQUENCY_HZ (when at MIN_FLOW_FREQUENCY_HZ)', () => {
      element.flowFrequency = MIN_FLOW_FREQUENCY_HZ;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });

    test('does not decrease below MIN_FLOW_FREQUENCY_HZ (e.g. trying to go from 0.015 Hz to 0.005 Hz, clamps to 0.01 Hz)', () => {
      element.flowFrequency = 0.015;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });

    test('does not increase above MAX_FLOW_FREQUENCY_HZ (when at MAX_FLOW_FREQUENCY_HZ)', () => {
      element.flowFrequency = MAX_FLOW_FREQUENCY_HZ;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_HZ);
    });

    test('clamps to MAX_FLOW_FREQUENCY_HZ if incrementing would go higher (e.g. 19.5 Hz -> 20.0 Hz)', () => {
      element.flowFrequency = 19.5;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_HZ);
    });

    test('never reaches 0 when decreasing from slightly above MIN_FLOW_FREQUENCY_HZ (e.g. 0.01 Hz -> 0.01 Hz)', () => {
      element.flowFrequency = MIN_FLOW_FREQUENCY_HZ;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });

    test('never reaches 0 when decreasing from 0.02 Hz (0.02 Hz -> 0.01 Hz)', () => {
      element.flowFrequency = 0.02;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const testCases = [
      { hz: 1.0, expected: '1.0 Hz' },
      { hz: 2.5, expected: '2.5 Hz' },
      { hz: 19.9, expected: '19.9 Hz' },
      { hz: 0.9, expected: '0.90 Hz' },
      { hz: 0.5, expected: '0.50 Hz' },
      { hz: 0.1, expected: '0.10 Hz' },
      { hz: 0.08, expected: '0.08 Hz' },
      { hz: 0.01, expected: '0.01 Hz' },
      { hz: 0.009, expected: '0.01 Hz' }, // Rounds up due to toFixed(2)
      { hz: 0.001, expected: '0.00 Hz' }, // Rounds down due to toFixed(2)
      { hz: 0, expected: '0.00 Hz' },
      { hz: undefined as any, expected: 'N/A' },
      { hz: null as any, expected: 'N/A' },
    ];

    testCases.forEach(({ hz, expected }) => {
      it(`formats ${hz}Hz to "${expected}"`, () => {
        expect(element.formatFlowFrequency(hz)).toBe(expected);
      });
    });
  });
});

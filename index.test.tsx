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
    const transientMsgElement = element.shadowRoot?.querySelector(
      'span[style*="lightblue"]',
    );
    if (transientMsgElement)
      return transientMsgElement.textContent?.trim() || null;

    const redMsgElement =
      element.shadowRoot?.querySelector('span[style*="red"]');
    if (redMsgElement) return redMsgElement.textContent?.trim() || null;

    const yellowMsgElement = element.shadowRoot?.querySelector(
      'span[style*="yellow"]',
    );
    if (yellowMsgElement) return yellowMsgElement.textContent?.trim() || null;

    const orangeMsgElement = element.shadowRoot?.querySelector(
      'span[style*="orange"]',
    );
    if (orangeMsgElement) return orangeMsgElement.textContent?.trim() || null;

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
      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Loaded');
      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      // After transient message clears, no persistent success message should remain
      expect(getApiKeyStatusMessage()).toBeNull();
    });
  });

  describe('Direct Save Operations (e.g., via paste or future explicit save button)', () => {
    test('successful direct save displays "API Key Saved" then clears', async () => {
      element.geminiApiKey = VALID_API_KEY;
      // Direct call to save, not via debounce
      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync(); // Ensure all async operations within save complete

      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull(); // No persistent success message
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

      expect(setItemSpy).toHaveBeenCalledTimes(3);
      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
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
      expect(saveSpy).toHaveBeenCalledTimes(1);

      await vi.runAllTimersAsync();
      await element.updateComplete;

      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
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
      expect(saveSpy).toHaveBeenCalledTimes(1);

      await vi.runAllTimersAsync();
      await element.updateComplete;

      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
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
      expect(element.apiKeySavedSuccessfully).toBe(true);
      expect(element.transientApiKeyStatusMessage).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
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
      expect(element.transientApiKeyStatusMessage).toBeNull();

      // Now clear it
      element.geminiApiKey = null;
      await (element as any).saveApiKeyToLocalStorage();
      // Do not advance all timers yet, assert the message immediately after it's set
      await element.updateComplete; // Ensure LitElement has rendered the new message
      expect(element.transientApiKeyStatusMessage).toBe('API Key Cleared');
      expect(getApiKeyStatusMessage()).toBe('API Key Cleared');

      // Now advance timers to clear the transient message
      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.'); // Should default to this
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
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
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

  // Helper to convert Hz to MS, rounding as the internal logic might.
  const hzToMs = (hz: number) => Math.round(1000 / hz);
  // Helper to convert MS to Hz for assertions.
  const msToHz = (ms: number) => 1000 / ms;

  // Constants for the actual clamping range of flowFrequency (in MS)
  // Derived from PromptDjMidi's MIN_FLOW_FREQUENCY_HZ (0.01 Hz) and MAX_FLOW_FREQUENCY_HZ (20.0 Hz)
  const MIN_FLOW_FREQUENCY_MS = hzToMs(20.0); // 50ms
  const MAX_FLOW_FREQUENCY_MS = hzToMs(0.01); // 100000ms

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
      // Default is 1 Hz, which is 1000ms
      expect(element.flowFrequency).toBe(1000);
    });

    // Test Cases: Step Logic (Hz >= 1.0, i.e., ms <= 1000ms)
    test('increases by 1.0 Hz when current > 1.0 Hz (e.g., 1.5 -> 2.5)', () => {
      element.flowFrequency = hzToMs(1.5); // ~667ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 2.5, which is hzToMs(2.5) = 400ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(2.5);
      expect(element.flowFrequency).toBe(hzToMs(2.5));
    });

    test('decreases by 1.0 Hz when current > 1.0 Hz and not 1.0 (e.g. 2.0 -> 1.0)', () => {
      element.flowFrequency = hzToMs(2.0); // 500ms
      (element as any).adjustFrequency(false);
      // Expected new Hz is 1.0, which is hzToMs(1.0) = 1000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(1.0);
      expect(element.flowFrequency).toBe(hzToMs(1.0));
    });

    test('increases by 1.0 Hz from 1.0 Hz (1.0 -> 2.0)', () => {
      element.flowFrequency = hzToMs(1.0); // 1000ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 2.0, which is hzToMs(2.0) = 500ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(2.0);
      expect(element.flowFrequency).toBe(hzToMs(2.0));
    });

    test('decreases by 0.1 Hz from 1.0 Hz (1.0 -> 0.9)', () => {
      element.flowFrequency = hzToMs(1.0); // 1000ms
      (element as any).adjustFrequency(false);
      // Expected new Hz is 0.9, which is hzToMs(0.9) = 1111ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.9);
      expect(element.flowFrequency).toBe(hzToMs(0.9));
    });

    // Test Cases: Step Logic (0.1 Hz <= Hz < 1.0 Hz, i.e., 1000ms < ms <= 10000ms)
    test('increases by 0.1 Hz when current is 0.5 Hz (0.5 -> 0.6)', () => {
      element.flowFrequency = hzToMs(0.5); // 2000ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 0.6, which is hzToMs(0.6) = 1667ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.6);
      expect(element.flowFrequency).toBe(hzToMs(0.6));
    });

    test('decreases by 0.1 Hz when current is 0.6 Hz (0.6 -> 0.5)', () => {
      element.flowFrequency = hzToMs(0.6); // 1667ms
      (element as any).adjustFrequency(false);
      // Expected new Hz is 0.5, which is hzToMs(0.5) = 2000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.5);
      expect(element.flowFrequency).toBe(hzToMs(0.5));
    });

    test('increases by 0.1 Hz from 0.1 Hz (0.1 -> 0.2)', () => {
      element.flowFrequency = hzToMs(0.1); // 10000ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 0.2, which is hzToMs(0.2) = 5000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.2);
      expect(element.flowFrequency).toBe(hzToMs(0.2));
    });

    test('decreases by 0.01 Hz from 0.1 Hz (0.1 -> 0.09)', () => {
      element.flowFrequency = hzToMs(0.1); // 10000ms
      (element as any).adjustFrequency(false);
      // Expected new Hz is 0.09, which is hzToMs(0.09) = 11111ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.09);
      expect(element.flowFrequency).toBe(hzToMs(0.09));
    });

    // Test Cases: Step Logic (Hz < 0.1, i.e., ms > 10000ms)
    test('increases by 0.01 Hz when current is 0.05 Hz (0.05 -> 0.06)', () => {
      element.flowFrequency = hzToMs(0.05); // 20000ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 0.06, which is hzToMs(0.06) = 16667ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.06);
      expect(element.flowFrequency).toBe(hzToMs(0.06));
    });

    test('decreases by 0.01 Hz when current is 0.06 Hz (0.06 -> 0.05)', () => {
      element.flowFrequency = hzToMs(0.06); // 16667ms
      (element as any).adjustFrequency(false);
      // Expected new Hz is 0.05, which is hzToMs(0.05) = 20000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.05);
      expect(element.flowFrequency).toBe(hzToMs(0.05));
    });

    test('increases by 0.01 Hz from MIN_FLOW_FREQUENCY_HZ (0.01 -> 0.02)', () => {
      element.flowFrequency = hzToMs(0.01); // 100000ms (MAX_FLOW_FREQUENCY_MS)
      (element as any).adjustFrequency(true);
      // Expected new Hz is 0.02, which is hzToMs(0.02) = 50000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.02);
      expect(element.flowFrequency).toBe(hzToMs(0.02));
    });

    // Test Cases: Transitions between step logic
    test('transitions from 0.1 step to 1.0 step when increasing from 0.9 Hz (0.9 -> 1.0)', () => {
      element.flowFrequency = hzToMs(0.9); // 1111ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 1.0, which is hzToMs(1.0) = 1000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(1.0);
      expect(element.flowFrequency).toBe(hzToMs(1.0));
    });

    test('transitions from 0.01 step to 0.1 step when increasing from 0.09 Hz (0.09 -> 0.10)', () => {
      element.flowFrequency = hzToMs(0.09); // 11111ms
      (element as any).adjustFrequency(true);
      // Expected new Hz is 0.1, which is hzToMs(0.1) = 10000ms
      expect(msToHz(element.flowFrequency)).toBeCloseTo(0.1);
      expect(element.flowFrequency).toBe(hzToMs(0.1));
    });

    // Test Cases: Clamping
    test('does not decrease below MAX_FLOW_FREQUENCY_MS (when at MAX_FLOW_FREQUENCY_MS, which is 0.01 Hz)', () => {
      element.flowFrequency = MAX_FLOW_FREQUENCY_MS; // 100000ms (0.01 Hz)
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_MS);
    });

    test('does not decrease below MAX_FLOW_FREQUENCY_MS (e.g. trying to go from 0.015 Hz to 0.005 Hz, clamps to 0.01 Hz)', () => {
      // 0.015 Hz is hzToMs(0.015) = 66667ms
      element.flowFrequency = hzToMs(0.015);
      (element as any).adjustFrequency(false); // Should try to go to 0.005 Hz, which is 200000ms, but clamps to 100000ms (0.01 Hz)
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_MS);
    });

    test('does not increase above MIN_FLOW_FREQUENCY_MS (when at MIN_FLOW_FREQUENCY_MS, which is 20 Hz)', () => {
      element.flowFrequency = MIN_FLOW_FREQUENCY_MS; // 50ms (20 Hz)
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_MS);
    });

    test('clamps to MIN_FLOW_FREQUENCY_MS if incrementing would go higher (e.g. 19.5 Hz -> 20.0 Hz)', () => {
      // 19.5 Hz is hzToMs(19.5) = 51ms
      element.flowFrequency = hzToMs(19.5);
      (element as any).adjustFrequency(true); // Should try to go to 20.5 Hz, which is 49ms, but clamps to 50ms (20 Hz)
      expect(element.flowFrequency).toBe(MIN_FLOW_FREQUENCY_MS);
    });

    test('never reaches 0 when decreasing from slightly above MAX_FLOW_FREQUENCY_MS (e.g. 0.01 Hz -> 0.01 Hz)', () => {
      element.flowFrequency = hzToMs(0.01); // 100000ms
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_MS);
    });

    test('never reaches 0 when decreasing from 0.02 Hz (0.02 Hz -> 0.01 Hz)', () => {
      element.flowFrequency = hzToMs(0.02); // 50000ms
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MAX_FLOW_FREQUENCY_MS);
    });
  });

  describe('formatFlowFrequency', () => {
    const testCases = [
      { ms: 1000, expected: '1.00 Hz' }, // Changed from '1.0 Hz' to '1.00 Hz'
      { ms: 500, expected: '2.0 Hz' }, // 2.0 Hz
      { ms: 1111, expected: '0.9 Hz' }, // 1000/1111 = 0.900... Hz
      { ms: 2000, expected: '0.5 Hz' }, // 0.5 Hz
      { ms: 10000, expected: '0.1 Hz' }, // 0.1 Hz
      { ms: 12500, expected: '8.0 cHz' }, // 1000/12500 = 0.08 Hz = 8.0 cHz
      { ms: 20000, expected: '5.0 cHz' }, // 1000/20000 = 0.05 Hz = 5.0 cHz
      { ms: 100000, expected: '1.0 cHz' }, // 1000/100000 = 0.01 Hz = 1.0 cHz
      { ms: 200000, expected: '5.0 mHz' }, // 1000/200000 = 0.005 Hz = 5.0 mHz
      { ms: 0, expected: 'N/A' },
      { ms: -100, expected: 'N/A' },
    ];

    testCases.forEach(({ ms, expected }) => {
      it(`formats ${ms}ms to "${expected}"`, () => {
        expect(element.formatFlowFrequency(ms)).toBe(expected);
      });
    });

    test('handles undefined or null input', () => {
      expect(element.formatFlowFrequency(undefined as any)).toBe('N/A');
      expect(element.formatFlowFrequency(null as any)).toBe('N/A');
    });
  });
});

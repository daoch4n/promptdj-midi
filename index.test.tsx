import { fixture, html, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import type { MockInstance } from 'vitest';
import { PromptDjMidi } from './index';
import type { MidiDispatcher } from './utils/MidiDispatcher';

const TRANSIENT_MESSAGE_DURATION = 2500;

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
      const testKey = 'verified-key';
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
      element.geminiApiKey = 'test-key';
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
      const testKey = 'test-key-retry-success';
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

      apiKeyInput.value = 'new-key-debounced';
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

      apiKeyInput.value = 'key1';
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );
      vi.advanceTimersByTime(200);

      apiKeyInput.value = 'key12';
      apiKeyInput.dispatchEvent(
        new Event('input', { bubbles: true, composed: true }),
      );
      vi.advanceTimersByTime(200);

      apiKeyInput.value = 'key123';
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
      const pastedKey = 'pasted-key-transient';
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
      element.geminiApiKey = 'key-to-be-cleared';
      await (element as any).saveApiKeyToLocalStorage();
      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION); // Let "API Key Saved" clear
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();

      // Now clear it
      element.geminiApiKey = null;
      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync();

      expect(element.transientApiKeyStatusMessage).toBe('API Key Cleared');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Cleared');

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element.transientApiKeyStatusMessage).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.'); // Should default to this
    });

    test('new transient message clears previous one and has its own timeout', async () => {
      localStorageGetItemSpy.mockReturnValue('initial-key');
      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      vi.spyOn(element as any, 'handleMainAudioButton').mockImplementation(
        async () => {},
      );
      document.body.appendChild(element);
      await element.updateComplete;

      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      vi.advanceTimersByTime(1000);

      element.geminiApiKey = 'new-saved-key';
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

      element.geminiApiKey = 'any-key';
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
      element.geminiApiKey = 'any-key';

      await (element as any).saveApiKeyToLocalStorage();
      await vi.runAllTimersAsync();

      expect(element.apiKeyInvalid).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'API Key is invalid or saving failed.',
      );

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain(
        'API Key is invalid or saving failed.',
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
      element.geminiApiKey = 'some-typed-key';
      element.apiKeySavedSuccessfully = false;
      element.apiKeyInvalid = false;
      element.transientApiKeyStatusMessage = null;
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe(
        'Key entered, will attempt to save.',
      );

      vi.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe(
        'Key entered, will attempt to save.',
      );
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  beforeEach(async () => {
    // ... (rest of beforeEach setup remains the same)
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
    // ... (rest of afterEach remains the same)
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
  });

  describe('adjustFrequency', () => {
    const MIN_HZ = 0.01; // Reflects PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0; // Reflects PromptDjMidi.MAX_FLOW_FREQUENCY_HZ

    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1); // Default is 1 Hz
    });

    // Test Cases: Step Logic (>= 1 Hz)
    test('increases by 1.0 Hz when current > 1.0 Hz (e.g., 1.5 -> 2.5)', () => {
      element.flowFrequency = 1.5;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(2.5);
    });

    test('decreases by 1.0 Hz when current > 1.0 Hz and not 1.0 (e.g. 2.0 -> 1.0)', () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(1.0);
    });

    test('increases by 1.0 Hz from 1.0 Hz (1.0 -> 2.0)', () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(2.0);
    });

    test('decreases by 0.1 Hz from 1.0 Hz (1.0 -> 0.9)', () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.9);
    });

    // Test Cases: Step Logic (0.1 Hz to < 1 Hz)
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

    test('decreases by 0.01 Hz from 0.1 Hz (0.1 -> 0.09)', () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBeCloseTo(0.09);
    });

    // Test Cases: Step Logic (< 0.1 Hz)
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

    test('increases by 0.01 Hz from MIN_HZ (0.01 -> 0.02)', () => {
      element.flowFrequency = MIN_HZ; // 0.01
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Test Cases: Transitions between step logic (these are now covered by the direct 1.0 and 0.1 Hz tests)
    test('transitions from 0.1 step to 1.0 step when increasing from 0.9 Hz (0.9 -> 1.0)', () => {
      element.flowFrequency = 0.9;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(1.0);
    });

    test('transitions from 0.01 step to 0.1 step when increasing from 0.09 Hz (0.09 -> 0.10)', () => {
      element.flowFrequency = 0.09;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBeCloseTo(0.1);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_HZ (when at MIN_HZ)', () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not decrease below MIN_HZ (e.g. trying to go from 0.015 to 0.005, clamps to 0.01)', () => {
      element.flowFrequency = MIN_HZ + 0.005; // 0.015, current step is 0.01
      (element as any).adjustFrequency(false); // 0.015 - 0.01 = 0.005, which is < MIN_HZ
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not increase above MAX_HZ (when at MAX_HZ)', () => {
      element.flowFrequency = MAX_HZ;
      (element as any).adjustFrequency(true);
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('clamps to MAX_HZ if incrementing would go higher (e.g. 19.5 -> 20.0)', () => {
      element.flowFrequency = 19.5; // Step is 1.0
      (element as any).adjustFrequency(true); // 19.5 + 1.0 = 20.5, clamps to 20.0
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('never reaches 0 when decreasing from slightly above MIN_HZ (e.g. 0.01 -> 0.01)', () => {
      element.flowFrequency = MIN_HZ; //0.01
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('never reaches 0 when decreasing from 0.02 Hz (0.02 -> 0.01)', () => {
      element.flowFrequency = 0.02;
      (element as any).adjustFrequency(false);
      expect(element.flowFrequency).toBe(MIN_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const MIN_HZ = 0.01;
    const MAX_HZ = 20.0;

    test('formats >= 1.0 Hz to one decimal place', () => {
      expect(element.formatFlowFrequency(1.0)).toBe('1.0 Hz');
      expect(element.formatFlowFrequency(1.2)).toBe('1.2 Hz'); // Test for .2 not .20
      expect(element.formatFlowFrequency(12.3)).toBe('12.3 Hz');
      expect(element.formatFlowFrequency(MAX_HZ)).toBe('20.0 Hz');
    });

    test('formats < 1.0 Hz to two decimal places', () => {
      expect(element.formatFlowFrequency(0.5)).toBe('0.50 Hz');
      expect(element.formatFlowFrequency(0.25)).toBe('0.25 Hz');
      expect(element.formatFlowFrequency(0.01)).toBe('0.01 Hz');
      expect(element.formatFlowFrequency(MIN_HZ)).toBe('0.01 Hz');
      expect(element.formatFlowFrequency(0.99)).toBe('0.99 Hz');
    });

    test('formats values that might result from adjustFrequency rounding', () => {
      expect(element.formatFlowFrequency(0.0123)).toBe('0.01 Hz'); // Rounds down
      expect(element.formatFlowFrequency(0.999)).toBe('1.0 Hz'); // Rounds up to 1.0 Hz
      expect(element.formatFlowFrequency(0.098)).toBe('0.10 Hz'); // Rounds up
    });

    test('handles undefined or null input', () => {
      expect(element.formatFlowFrequency(undefined as any)).toBe('N/A');
      expect(element.formatFlowFrequency(null as any)).toBe('N/A');
    });
  });
});

import { html, fixture, expect, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import { PromptDjMidi } from './index';
import { MidiDispatcher } from './utils/MidiDispatcher';

const TRANSIENT_MESSAGE_DURATION = 2500;

describe('PromptDjMidi - API Key Management with Transient Messages', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  // Mocks for localStorage
  let localStorageGetItemSpy: jest.SpyInstance;
  let localStorageSetItemSpy: jest.SpyInstance;
  let localStorageRemoveItemSpy: jest.SpyInstance;

  // Mocks for console
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  // Mocks for navigator.clipboard
  let clipboardReadTextSpy: jest.SpyInstance;
  let clearTimeoutSpy: jest.SpyInstance;


  beforeEach(async () => {
    jest.useFakeTimers();

    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as MidiDispatcher;

    localStorageGetItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    localStorageSetItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    localStorageRemoveItemSpy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');


    clipboardReadTextSpy = jest.fn().mockResolvedValue('default-clipboard-text');
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: clipboardReadTextSpy, },
      configurable: true, writable: true,
    });

    element = new PromptDjMidi(new Map(), mockMidiDispatcher);

    jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});

    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const getApiKeyStatusMessage = () => {
    const transientMsgElement = element.shadowRoot?.querySelector('span[style*="lightblue"]');
    if (transientMsgElement) return transientMsgElement.textContent?.trim() || null;

    const redMsgElement = element.shadowRoot?.querySelector('span[style*="red"]');
    if (redMsgElement) return redMsgElement.textContent?.trim() || null;

    const yellowMsgElement = element.shadowRoot?.querySelector('span[style*="yellow"]');
    if (yellowMsgElement) return yellowMsgElement.textContent?.trim() || null;

    const orangeMsgElement = element.shadowRoot?.querySelector('span[style*="orange"]');
    if (orangeMsgElement) return orangeMsgElement.textContent?.trim() || null;

    return null;
  };

  describe('Initial Load and State', () => {
    test('initial load - no API key in localStorage, shows "No API Key provided." after transient clears', async () => {
      // Constructor calls checkApiKeyStatus. If transient "API Key Loaded" was set, it would clear.
      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;

      expect(localStorageGetItemSpy).toHaveBeenCalledWith('geminiApiKey');
      expect(element['apiKeySavedSuccessfully']).toBe(false);
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.');
    });

    test('initial load - API key exists, shows transient "API Key Loaded", then no persistent success message', async () => {
      const testKey = 'verified-key';
      localStorageGetItemSpy.mockReturnValue(testKey);

      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
      document.body.appendChild(element);
      await element.updateComplete;

      expect(element['geminiApiKey']).toBe(testKey);
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Loaded');
      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      // After transient message clears, no persistent success message should remain
      expect(getApiKeyStatusMessage()).toBeNull();
    });
  });

  describe('Direct Save Operations (e.g., via paste or future explicit save button)', () => {
    test('successful direct save displays "API Key Saved" then clears', async () => {
      element['geminiApiKey'] = 'test-key';
      // Direct call to save, not via debounce
      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync(); // Ensure all async operations within save complete

      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull(); // No persistent success message
    });

    test('API key saving succeeds after retries, shows transient "API Key Saved"', async () => {
      const testKey = 'test-key-retry-success';
      element['geminiApiKey'] = testKey;

      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementationOnce(() => { throw new Error('Simulated localStorage error 1'); })
        .mockImplementationOnce(() => { throw new Error('Simulated localStorage error 2'); })
        .mockImplementationOnce(() => {}); // Success on the third try

      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync(); // Process retries and their timeouts

      expect(setItemSpy).toHaveBeenCalledTimes(3);
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
    });
  });

  describe('Debounced Autosave on Input', () => {
    test('input change calls debounced save, shows transient "API Key Saved"', async () => {
      const saveSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;

      apiKeyInput.value = 'new-key-debounced';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      expect(saveSpy).not.toHaveBeenCalled(); // Not called immediately

      jest.advanceTimersByTime(499);
      expect(element['transientApiKeyStatusMessage']).toBeNull();

      jest.advanceTimersByTime(1); // Total 500ms, trigger debounce
      expect(saveSpy).toHaveBeenCalledTimes(1);

      await jest.runAllTimersAsync();
      await element.updateComplete;

      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
    });

    test('multiple input changes trigger only one save call, shows transient "API Key Saved"', async () => {
      const saveSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;

      apiKeyInput.value = 'key1';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      jest.advanceTimersByTime(200);

      apiKeyInput.value = 'key12';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      jest.advanceTimersByTime(200);

      apiKeyInput.value = 'key123';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      expect(saveSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500); // Past debounce of last input
      expect(saveSpy).toHaveBeenCalledTimes(1);

      await jest.runAllTimersAsync();
      await element.updateComplete;

      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
    });
  });

  describe('Paste API Key Button', () => {
    let pasteButton: HTMLButtonElement;

    beforeEach(async () => {
      element['geminiApiKey'] = null;
      element['apiKeyInvalid'] = true;
      await element.updateComplete;
      pasteButton = element.shadowRoot?.querySelector('.api-controls button') as HTMLButtonElement;
    });

    test('successful paste shows transient "API Key Saved"', async () => {
      const pastedKey = 'pasted-key-transient';
      clipboardReadTextSpy.mockResolvedValue(pastedKey);
      const directSaveSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');

      pasteButton.click();
      await jest.runAllTimersAsync();
      await element.updateComplete;

      expect(directSaveSpy).toHaveBeenCalledTimes(1);
      expect(element['geminiApiKey']).toBe(pastedKey);
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
    });

    // Other paste tests (clipboard unavailable, error, empty) remain relevant for behavior,
    // just ensure they don't assert for messages that are now transient or removed.
    test('clipboard API unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      const directSaveSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
      pasteButton.click();
      await element.updateComplete;
      expect(consoleWarnSpy).toHaveBeenCalledWith('Clipboard API not available or readText not supported.');
      expect(directSaveSpy).not.toHaveBeenCalled();
      expect(getApiKeyStatusMessage()).not.toBe('API Key Saved');
    });
  });

  describe('Transient Message Management', () => {
     test('successful clear displays "API Key Cleared" then clears', async () => {
      // Have a key first
      element['geminiApiKey'] = 'key-to-be-cleared';
      await (element as any).saveApiKeyToLocalStorage();
      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION); // Let "API Key Saved" clear
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();

      // Now clear it
      element['geminiApiKey'] = null;
      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync();

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Cleared');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Cleared');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBe('No API Key provided.'); // Should default to this
    });

    test('new transient message clears previous one and has its own timeout', async () => {
      localStorageGetItemSpy.mockReturnValue('initial-key');
      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
      document.body.appendChild(element);
      await element.updateComplete;

      expect(getApiKeyStatusMessage()).toBe('API Key Loaded');

      jest.advanceTimersByTime(1000);

      element['geminiApiKey'] = 'new-saved-key';
      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync();

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');
      expect(clearTimeoutSpy).toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toBe('API Key Saved');

      jest.advanceTimersByTime(1500);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull();
    });

    // Add element to the DOM to allow Lit an update cycle.
    // This is important for `updateComplete` and for querying shadow DOM.
    document.body.appendChild(element);
    await element.updateComplete; // Wait for initial render and updates from constructor
  });

  describe('Persistent/Static Message Tests (Unaffected by Transient Timeout)', () => {
    test('apiKeyInvalid shows persistent error for localStorage unavailable', async () => {
      const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

      element['geminiApiKey'] = 'any-key';
      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync();

      expect(element['apiKeyInvalid']).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('localStorage not available. API Key cannot be saved.');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('localStorage not available. API Key cannot be saved.');

      if(originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
    });

    test('apiKeyInvalid shows persistent error for general save failure', async () => {
      localStorageSetItemSpy.mockImplementation(() => { throw new Error('Save failed'); });
      element['geminiApiKey'] = 'any-key';

      await (element as any).saveApiKeyToLocalStorage();
      await jest.runAllTimersAsync();

      expect(element['apiKeyInvalid']).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key is invalid or saving failed.');

      jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key is invalid or saving failed.');
    });

    test('shows "No API Key provided" when key is empty, not saved, not invalid, and no transient message', async () => {
        element['geminiApiKey'] = null;
        element['apiKeySavedSuccessfully'] = false;
        element['apiKeyInvalid'] = false;
        element['transientApiKeyStatusMessage'] = null;
        await element.updateComplete; // This is line 329
        expect(getApiKeyStatusMessage()).toBe('No API Key provided.');

        jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toBe('No API Key provided.');
    });

    test('shows "Key entered, will attempt to save." when key entered, not saved, not invalid, no transient message', async () => {
        element['geminiApiKey'] = 'some-typed-key';
        element['apiKeySavedSuccessfully'] = false;
        element['apiKeyInvalid'] = false;
        element['transientApiKeyStatusMessage'] = null;
        await element.updateComplete; // This is effectively line 329 that caused issues if not async
        expect(getApiKeyStatusMessage()).toBe('Key entered, will attempt to save.');

        jest.advanceTimersByTime(TRANSIENT_MESSAGE_DURATION + 1000);
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toBe('Key entered, will attempt to save.');
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  beforeEach(async () => {
    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(),
      off: jest.fn(),
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
    const MIN_HZ = 0.001; // Reflects updated PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0; // Reflects PromptDjMidi.MAX_FLOW_FREQUENCY_HZ

    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1); // Default is 1 Hz
    });

    // Test Cases: Step Logic for values > 1.0 Hz
    test('decreases by 1.0 Hz when current is 2.0 Hz', async () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    test('increases by 1.0 Hz when current is 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(6.5);
    });

    // Test Cases: Step Logic for 1.0 Hz boundary
    test('at 1.0 Hz, decrements by 0.1 Hz to 0.9 Hz', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.9);
    });

    test('at 1.0 Hz, increments by 1.0 Hz to 2.0 Hz', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(2.0);
    });

    // Test Cases: Step Logic for 0.1 < currentHz < 1.0
    test('from 0.9 Hz, increments by 0.1 Hz to 1.0 Hz', async () => {
      element.flowFrequency = 0.9;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    test('from 0.5 Hz, decrements by 0.1 Hz to 0.4 Hz', async () => {
      element.flowFrequency = 0.5;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.4);
    });

    // Test Cases: Step Logic for 0.1 Hz boundary
    test('at 0.1 Hz, decrements by 0.01 Hz to 0.09 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.09);
    });

    test('at 0.1 Hz, increments by 0.1 Hz to 0.2 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.2);
    });

    // Test Cases: Step Logic for 0.01 < currentHz < 0.1
    test('from 0.09 Hz, increments by 0.01 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 0.09;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.10);
    });

    test('from 0.05 Hz, decrements by 0.01 Hz to 0.04 Hz', async () => {
      element.flowFrequency = 0.05;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.04);
    });

    // Test Cases: Step Logic for 0.01 Hz boundary
     test('at 0.01 Hz, decrements by 0.001 Hz to 0.009 Hz', async () => {
      element.flowFrequency = 0.01;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.009, 3);
    });

    test('at 0.01 Hz, increments by 0.01 Hz to 0.02 Hz', async () => {
      element.flowFrequency = 0.01;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Test Cases: Step Logic for currentHz < 0.01 (down to MIN_FLOW_FREQUENCY_HZ)
    test('from 0.009 Hz, increments by 0.001 Hz to 0.01 Hz', async () => {
      element.flowFrequency = 0.009;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.010, 3);
    });

    test('from 0.002 Hz, decrements by 0.001 Hz to 0.001 Hz (MIN_HZ)', async () => {
      element.flowFrequency = 0.002;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.001, 3);
    });

    test('at MIN_HZ (0.001 Hz), increments by 0.001 Hz to 0.002 Hz', async () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.002, 3);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_HZ (0.001 Hz)', async () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(false); // attempts 0.001 - 0.001 = 0, should clamp to 0.001
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not increase above MAX_HZ (20.0 Hz)', async () => {
      element.flowFrequency = MAX_HZ;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('clamps to MAX_HZ if incrementing would go higher', async () => {
      element.flowFrequency = MAX_HZ - 0.5; // 19.5 Hz
      (element as any).adjustFrequency(true); // 19.5 + 1.0 = 20.5, clamps to 20.0
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const MIN_HZ = 0.001; // Reflects updated PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0;

    test('formats >= 1.0 Hz to one decimal place', () => {
      expect(element['formatFlowFrequency'](1.0)).toBe("1.0 Hz");
      expect(element['formatFlowFrequency'](12.3)).toBe("12.3 Hz");
      expect(element['formatFlowFrequency'](MAX_HZ)).toBe("20.0 Hz");
    });

    test('formats < 1.0 Hz and >= 0.01 Hz to two decimal places', () => {
      expect(element['formatFlowFrequency'](0.5)).toBe("0.50 Hz");
      expect(element['formatFlowFrequency'](0.25)).toBe("0.25 Hz");
      expect(element['formatFlowFrequency'](0.01)).toBe("0.01 Hz");
    });

    test('formats < 0.01 Hz to three decimal places', () => {
      expect(element['formatFlowFrequency'](0.009)).toBe("0.009 Hz");
      expect(element['formatFlowFrequency'](0.001)).toBe("0.001 Hz");
      expect(element['formatFlowFrequency'](MIN_HZ)).toBe("0.001 Hz");
    });

    test('formats values that might result from adjustFrequency rounding', () => {
      expect(element['formatFlowFrequency'](0.0123)).toBe("0.01 Hz"); // Rounds to 2 decimal places
      expect(element['formatFlowFrequency'](0.999)).toBe("1.0 Hz");
      expect(element['formatFlowFrequency'](0.0099)).toBe("0.01 Hz"); // Rounds to 2, not 3
    });

    test('handles undefined or null input', () => {
      expect(element['formatFlowFrequency'](undefined as any)).toBe("N/A");
      expect(element['formatFlowFrequency'](null as any)).toBe("N/A");
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  beforeEach(async () => {
    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(),
      off: jest.fn(),
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
    const MIN_HZ = 0.01; // Reflects PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0; // Reflects PromptDjMidi.MAX_FLOW_FREQUENCY_HZ

    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1);
    });

    // Test Cases: Step Logic (>= 1 Hz)
    test('increases by 1.0 Hz when current is 1.0 Hz (special case to 2.0 Hz)', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(2.0);
    });

    test('decreases by 1.0 Hz when current > 1.0 Hz (e.g. 2.0 -> 1.0)', async () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    test('increases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(6.5);
    });

    test('decreases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(4.5);
    });

    // Test Cases: Step Logic (0.1 Hz to < 1 Hz)
    test('increases by 0.1 Hz when current is 0.5 Hz', async () => {
      element.flowFrequency = 0.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.6);
    });

    test('decreases by 0.1 Hz when current is 0.6 Hz', async () => {
      element.flowFrequency = 0.6;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.5);
    });

    test('increases from 0.9 Hz to 1.0 Hz', async () => {
      element.flowFrequency = 0.9;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    // Test Cases: Step Logic (< 0.1 Hz)
    test('increases by 0.01 Hz when current is 0.05 Hz', async () => {
      element.flowFrequency = 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.06);
    });

    test('decreases by 0.01 Hz when current is 0.06 Hz', async () => {
      element.flowFrequency = 0.06;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.05);
    });

    test('increases by 0.01 Hz from 0.01 Hz (MIN_HZ)', async () => {
      element.flowFrequency = MIN_HZ; // 0.01
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Specific Test Cases for 1.0 Hz boundary
    test('at 1.0 Hz, decrements by 0.1 Hz to 0.9 Hz', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.9);
    });

    // Specific Test Cases for 0.1 Hz boundary
    test('at 0.1 Hz, decrements by 0.01 Hz to 0.09 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.09);
    });

    test('at 0.1 Hz, increments by 0.1 Hz to 0.2 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.2);
    });

    // Verify Behavior Around 1.0 Hz (covers transitions)
    test('from 1.1 Hz, decrements by 1.0 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.1);
    });

    test('from 1.1 Hz, increments by 1.0 Hz to 2.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(2.1);
    });

    // Verify Behavior Around 0.1 Hz (covers transitions)
    test('from 0.09 Hz, increments by 0.01 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 0.09;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.10);
    });

    test('from 0.11 Hz, decrements by 0.1 Hz to 0.01 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.01);
    });

    test('from 0.11 Hz, increments by 0.1 Hz to 0.21 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.21);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_HZ', async () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not increase above MAX_HZ', async () => {
      element.flowFrequency = MAX_HZ;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('clamps to MIN_HZ if decrementing would go lower (e.g. 0.015 -> 0.01)', async () => {
      element.flowFrequency = MIN_HZ + 0.005;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('clamps to MAX_HZ if incrementing would go higher (e.g. 19.95 -> 20.0)', async () => {
      element.flowFrequency = MAX_HZ - 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
     test('clamps to MAX_HZ when increasing from near MAX_HZ', async () => {
      element.flowFrequency = 19.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const MIN_HZ = 0.01;
    const MAX_HZ = 20.0;

    test('formats >= 1.0 Hz to one decimal place', () => {
      expect(element['formatFlowFrequency'](1.0)).toBe("1.0 Hz");
      expect(element['formatFlowFrequency'](12.3)).toBe("12.3 Hz");
      expect(element['formatFlowFrequency'](MAX_HZ)).toBe("20.0 Hz");
    });

    test('formats < 1.0 Hz to two decimal places', () => {
      expect(element['formatFlowFrequency'](0.5)).toBe("0.50 Hz");
      expect(element['formatFlowFrequency'](0.25)).toBe("0.25 Hz");
      expect(element['formatFlowFrequency'](0.01)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](MIN_HZ)).toBe("0.01 Hz");
    });

    test('formats values that might result from adjustFrequency rounding (e.g. 0.0123 -> "0.01 Hz")', () => {
      expect(element['formatFlowFrequency'](0.0123)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](0.999)).toBe("1.0 Hz");
    });

    test('handles undefined or null input', () => {
      expect(element['formatFlowFrequency'](undefined as any)).toBe("N/A");
      expect(element['formatFlowFrequency'](null as any)).toBe("N/A");
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  beforeEach(async () => {
    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(),
      off: jest.fn(),
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
    const MIN_HZ = 0.01; // Reflects PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0; // Reflects PromptDjMidi.MAX_FLOW_FREQUENCY_HZ

    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1);
    });

    // Test Cases: Step Logic (>= 1 Hz)
    test('increases by 1.0 Hz when current is 1.0 Hz (special case to 2.0 Hz)', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(2.0);
    });

    test('decreases by 1.0 Hz when current > 1.0 Hz (e.g. 2.0 -> 1.0)', async () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    test('increases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(6.5);
    });

    test('decreases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(4.5);
    });

    // Test Cases: Step Logic (0.1 Hz to < 1 Hz)
    test('increases by 0.1 Hz when current is 0.5 Hz', async () => {
      element.flowFrequency = 0.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.6);
    });

    test('decreases by 0.1 Hz when current is 0.6 Hz', async () => {
      element.flowFrequency = 0.6;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.5);
    });

    test('increases from 0.9 Hz to 1.0 Hz', async () => {
      element.flowFrequency = 0.9;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    // Test Cases: Step Logic (< 0.1 Hz)
    test('increases by 0.01 Hz when current is 0.05 Hz', async () => {
      element.flowFrequency = 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.06);
    });

    test('decreases by 0.01 Hz when current is 0.06 Hz', async () => {
      element.flowFrequency = 0.06;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.05);
    });

    test('increases by 0.01 Hz from 0.01 Hz (MIN_HZ)', async () => {
      element.flowFrequency = MIN_HZ; // 0.01
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Specific Test Cases for 1.0 Hz boundary
    test('at 1.0 Hz, decrements by 0.1 Hz to 0.9 Hz', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.9);
    });

    // Specific Test Cases for 0.1 Hz boundary
    test('at 0.1 Hz, decrements by 0.01 Hz to 0.09 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.09);
    });

    test('at 0.1 Hz, increments by 0.1 Hz to 0.2 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.2);
    });

    // Verify Behavior Around 1.0 Hz (covers transitions)
    test('from 1.1 Hz, decrements by 1.0 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.1);
    });

    test('from 1.1 Hz, increments by 1.0 Hz to 2.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(2.1);
    });

    // Verify Behavior Around 0.1 Hz (covers transitions)
    test('from 0.09 Hz, increments by 0.01 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 0.09;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.10);
    });

    test('from 0.11 Hz, decrements by 0.1 Hz to 0.01 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.01);
    });

    test('from 0.11 Hz, increments by 0.1 Hz to 0.21 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.21);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_HZ', async () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not increase above MAX_HZ', async () => {
      element.flowFrequency = MAX_HZ;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('clamps to MIN_HZ if decrementing would go lower (e.g. 0.015 -> 0.01)', async () => {
      element.flowFrequency = MIN_HZ + 0.005;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('clamps to MAX_HZ if incrementing would go higher (e.g. 19.95 -> 20.0)', async () => {
      element.flowFrequency = MAX_HZ - 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
     test('clamps to MAX_HZ when increasing from near MAX_HZ', async () => {
      element.flowFrequency = 19.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const MIN_HZ = 0.01;
    const MAX_HZ = 20.0;

    test('formats >= 1.0 Hz to one decimal place', () => {
      expect(element['formatFlowFrequency'](1.0)).toBe("1.0 Hz");
      expect(element['formatFlowFrequency'](12.3)).toBe("12.3 Hz");
      expect(element['formatFlowFrequency'](MAX_HZ)).toBe("20.0 Hz");
    });

    test('formats < 1.0 Hz to two decimal places', () => {
      expect(element['formatFlowFrequency'](0.5)).toBe("0.50 Hz");
      expect(element['formatFlowFrequency'](0.25)).toBe("0.25 Hz");
      expect(element['formatFlowFrequency'](0.01)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](MIN_HZ)).toBe("0.01 Hz");
    });

    test('formats values that might result from adjustFrequency rounding (e.g. 0.0123 -> "0.01 Hz")', () => {
      expect(element['formatFlowFrequency'](0.0123)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](0.999)).toBe("1.0 Hz");
    });

    test('handles undefined or null input', () => {
      expect(element['formatFlowFrequency'](undefined as any)).toBe("N/A");
      expect(element['formatFlowFrequency'](null as any)).toBe("N/A");
    });
  });
});

describe('PromptDjMidi - Frequency Logic', () => {
  let element: PromptDjMidi;
  let mockMidiDispatcher: MidiDispatcher;

  beforeEach(async () => {
    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(),
      off: jest.fn(),
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
    const MIN_HZ = 0.01; // Reflects PromptDjMidi.MIN_FLOW_FREQUENCY_HZ
    const MAX_HZ = 20.0; // Reflects PromptDjMidi.MAX_FLOW_FREQUENCY_HZ

    test('initial flowFrequency value', () => {
      expect(element.flowFrequency).toBe(1);
    });

    // Test Cases: Step Logic (>= 1 Hz)
    test('increases by 1.0 Hz when current is 1.0 Hz (special case to 2.0 Hz)', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(2.0);
    });

    test('decreases by 1.0 Hz when current > 1.0 Hz (e.g. 2.0 -> 1.0)', async () => {
      element.flowFrequency = 2.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    test('increases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(6.5);
    });

    test('decreases by 1.0 Hz from 5.5 Hz', async () => {
      element.flowFrequency = 5.5;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(4.5);
    });

    // Test Cases: Step Logic (0.1 Hz to < 1 Hz)
    test('increases by 0.1 Hz when current is 0.5 Hz', async () => {
      element.flowFrequency = 0.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.6);
    });

    test('decreases by 0.1 Hz when current is 0.6 Hz', async () => {
      element.flowFrequency = 0.6;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.5);
    });

    test('increases from 0.9 Hz to 1.0 Hz', async () => {
      element.flowFrequency = 0.9;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(1.0);
    });

    // Test Cases: Step Logic (< 0.1 Hz)
    test('increases by 0.01 Hz when current is 0.05 Hz', async () => {
      element.flowFrequency = 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.06);
    });

    test('decreases by 0.01 Hz when current is 0.06 Hz', async () => {
      element.flowFrequency = 0.06;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.05);
    });

    test('increases by 0.01 Hz from 0.01 Hz (MIN_HZ)', async () => {
      element.flowFrequency = MIN_HZ; // 0.01
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.02);
    });

    // Specific Test Cases for 1.0 Hz boundary
    test('at 1.0 Hz, decrements by 0.1 Hz to 0.9 Hz', async () => {
      element.flowFrequency = 1.0;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.9);
    });

    // Specific Test Cases for 0.1 Hz boundary
    test('at 0.1 Hz, decrements by 0.01 Hz to 0.09 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.09);
    });

    test('at 0.1 Hz, increments by 0.1 Hz to 0.2 Hz', async () => {
      element.flowFrequency = 0.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.2);
    });

    // Verify Behavior Around 1.0 Hz (covers transitions)
    test('from 1.1 Hz, decrements by 1.0 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.1);
    });

    test('from 1.1 Hz, increments by 1.0 Hz to 2.1 Hz', async () => {
      element.flowFrequency = 1.1;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(2.1);
    });

    // Verify Behavior Around 0.1 Hz (covers transitions)
    test('from 0.09 Hz, increments by 0.01 Hz to 0.1 Hz', async () => {
      element.flowFrequency = 0.09;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.10);
    });

    test('from 0.11 Hz, decrements by 0.1 Hz to 0.01 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.01);
    });

    test('from 0.11 Hz, increments by 0.1 Hz to 0.21 Hz', async () => {
      element.flowFrequency = 0.11;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBeCloseTo(0.21);
    });

    // Test Cases: Clamping
    test('does not decrease below MIN_HZ', async () => {
      element.flowFrequency = MIN_HZ;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('does not increase above MAX_HZ', async () => {
      element.flowFrequency = MAX_HZ;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });

    test('clamps to MIN_HZ if decrementing would go lower (e.g. 0.015 -> 0.01)', async () => {
      element.flowFrequency = MIN_HZ + 0.005;
      (element as any).adjustFrequency(false);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MIN_HZ);
    });

    test('clamps to MAX_HZ if incrementing would go higher (e.g. 19.95 -> 20.0)', async () => {
      element.flowFrequency = MAX_HZ - 0.05;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
     test('clamps to MAX_HZ when increasing from near MAX_HZ', async () => {
      element.flowFrequency = 19.5;
      (element as any).adjustFrequency(true);
      await element.updateComplete;
      expect(element.flowFrequency).toBe(MAX_HZ);
    });
  });

  describe('formatFlowFrequency', () => {
    const MIN_HZ = 0.01;
    const MAX_HZ = 20.0;

    test('formats >= 1.0 Hz to one decimal place', () => {
      expect(element['formatFlowFrequency'](1.0)).toBe("1.0 Hz");
      expect(element['formatFlowFrequency'](12.3)).toBe("12.3 Hz");
      expect(element['formatFlowFrequency'](MAX_HZ)).toBe("20.0 Hz");
    });

    test('formats < 1.0 Hz to two decimal places', () => {
      expect(element['formatFlowFrequency'](0.5)).toBe("0.50 Hz");
      expect(element['formatFlowFrequency'](0.25)).toBe("0.25 Hz");
      expect(element['formatFlowFrequency'](0.01)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](MIN_HZ)).toBe("0.01 Hz");
    });

    test('formats values that might result from adjustFrequency rounding (e.g. 0.0123 -> "0.01 Hz")', () => {
      expect(element['formatFlowFrequency'](0.0123)).toBe("0.01 Hz");
      expect(element['formatFlowFrequency'](0.999)).toBe("1.0 Hz");
    });

    test('handles undefined or null input', () => {
      expect(element['formatFlowFrequency'](undefined as any)).toBe("N/A");
      expect(element['formatFlowFrequency'](null as any)).toBe("N/A");
    });
  });
});

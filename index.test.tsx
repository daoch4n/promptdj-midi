import { html, fixture, expect, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import { PromptDjMidi } from './index';
import { MidiDispatcher } from './utils/MidiDispatcher';

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
    jest.useFakeTimers(); // Use fake timers for all tests in this describe block

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

    // Spy on actual instance methods AFTER element creation
    // We spy on the real method to see if it's called, but also allow its execution.
    // Note: saveApiKeyToLocalStorage is already spied by the debounce test section if needed there
    // For direct calls, we can re-spy or use the existing one if scope allows.
    jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});

    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
    jest.restoreAllMocks();
    jest.clearAllTimers(); // Clear all pending timers
    jest.useRealTimers();
  });

  const getApiKeyStatusMessage = () => {
    // Helper to get the content of the status message span
    // This assumes a more specific selector if possible, or falls back to text content checking.
    // For transient message, it's in a specific span. For others, it might be different.
    const transientMsgElement = element.shadowRoot?.querySelector('span[style*="lightblue"]');
    if (transientMsgElement) return transientMsgElement.textContent;

    const redMsgElement = element.shadowRoot?.querySelector('span[style*="red"]');
    if (redMsgElement) return redMsgElement.textContent;

    const yellowMsgElement = element.shadowRoot?.querySelector('span[style*="yellow"]');
    if (yellowMsgElement) return yellowMsgElement.textContent;

    const orangeMsgElement = element.shadowRoot?.querySelector('span[style*="orange"]');
    if (orangeMsgElement) return orangeMsgElement.textContent;

    return null;
  };

  describe('Transient Message Tests', () => {
    test('successful save displays "API Key Saved" then clears', async () => {
      element['geminiApiKey'] = 'test-key';
      await element.saveApiKeyToLocalStorage(); // Direct call

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key Saved');

      jest.advanceTimersByTime(2500); // Default duration
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).not.toContain('API Key Saved');
    });

    test('successful load displays "API Key Loaded" then clears', async () => {
      localStorageGetItemSpy.mockReturnValue('loaded-key');
      // Re-initialize to simulate fresh load.
      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
      document.body.appendChild(element);
      await element.updateComplete;
      // Constructor calls checkApiKeyStatus, which should set the transient message

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Loaded');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key Loaded');

      jest.advanceTimersByTime(2500);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
       expect(getApiKeyStatusMessage()).not.toContain('API Key Loaded');
    });

    test('successful clear displays "API Key Cleared" then clears', async () => {
      element['geminiApiKey'] = null; // Simulate clearing the key
      await element.saveApiKeyToLocalStorage(); // This will trigger removal and set message

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Cleared');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key Cleared');

      jest.advanceTimersByTime(2500);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).not.toContain('API Key Cleared');
    });

    test('new transient message clears previous one and has its own timeout', async () => {
      // Initial load sets "API Key Loaded"
      localStorageGetItemSpy.mockReturnValue('initial-key');
      if (element.parentNode) element.parentNode.removeChild(element);
      element = new PromptDjMidi(new Map(), mockMidiDispatcher);
      jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
      document.body.appendChild(element);
      await element.updateComplete;

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Loaded');
      expect(getApiKeyStatusMessage()).toContain('API Key Loaded');

      jest.advanceTimersByTime(1000); // Advance part of the way

      // Now, simulate a save, which should set a new message "API Key Saved"
      element['geminiApiKey'] = 'new-saved-key';
      await element.saveApiKeyToLocalStorage();

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key Saved');
      expect(clearTimeoutSpy).toHaveBeenCalled(); // Check that previous timeout was cleared

      jest.advanceTimersByTime(1000); // Advance, but not enough for "API Key Saved" to clear yet (total 2000 for "Loaded", 1000 for "Saved")
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key Saved'); // Still "Saved"

      jest.advanceTimersByTime(1500); // Advance enough for "API Key Saved" to clear (total 2500 for "Saved")
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      expect(getApiKeyStatusMessage()).toBeNull(); // Or whatever the default non-transient state is
    });

    // Add element to the DOM to allow Lit an update cycle.
    // This is important for `updateComplete` and for querying shadow DOM.
    document.body.appendChild(element);
    await element.updateComplete; // Wait for initial render and updates from constructor
  });

  describe('Persistent/Static Message Tests', () => {
    test('apiKeyInvalid shows persistent error for localStorage unavailable', async () => {
      const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

      element['geminiApiKey'] = 'any-key';
      await element.saveApiKeyToLocalStorage(); // This will set apiKeyInvalid

      expect(element['apiKeyInvalid']).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('localStorage not available. API Key cannot be saved.');

      jest.advanceTimersByTime(3000); // Well past transient duration
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('localStorage not available. API Key cannot be saved.'); // Still there

      if(originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
    });

    test('apiKeyInvalid shows persistent error for general save failure', async () => {
      localStorageSetItemSpy.mockImplementation(() => { throw new Error('Save failed'); });
      element['geminiApiKey'] = 'any-key';
      const maxRetries = (element as any).maxRetries || 3;

      await element.saveApiKeyToLocalStorage(); // This will retry and fail, then set apiKeyInvalid

      expect(element['apiKeyInvalid']).toBe(true);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key is invalid or saving failed.');

      jest.advanceTimersByTime(3000);
      await element.updateComplete;
      expect(getApiKeyStatusMessage()).toContain('API Key is invalid or saving failed.');
    });

    test('shows "No API Key provided" when key is empty and not saved', async () => {
        element['geminiApiKey'] = null;
        element['apiKeySavedSuccessfully'] = false;
        element['apiKeyInvalid'] = false; // Ensure not invalid
        element['transientApiKeyStatusMessage'] = null; // Ensure no transient message
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toContain('No API Key provided.');

        jest.advanceTimersByTime(3000);
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toContain('No API Key provided.');
    });

    test('shows "Key entered, will attempt to save." when key entered but not yet saved/verified', async () => {
        element['geminiApiKey'] = 'some-typed-key';
        element['apiKeySavedSuccessfully'] = false;
        element['apiKeyInvalid'] = false;
        element['transientApiKeyStatusMessage'] = null;
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toContain('Key entered, will attempt to save.');

        jest.advanceTimersByTime(3000);
        await element.updateComplete;
        expect(getApiKeyStatusMessage()).toContain('Key entered, will attempt to save.');
    });
  });

  // Previous Debounce and Paste tests might need slight adjustments to UI message checks
  // if they were expecting persistent "API Key Saved & Verified".
  // They should now look for the transient message first, then its absence.

  describe('Debounced Autosave on Input (with Transient Msg Check)', () => {
    test('input change calls debounced save, shows transient message', async () => {
      jest.useFakeTimers();
      const saveSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;

      apiKeyInput.value = 'new-key-debounced';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      expect(saveSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(499);
      expect(element['transientApiKeyStatusMessage']).toBeNull(); // Not saved yet

      jest.advanceTimersByTime(1); // Total 500ms, trigger debounce
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // saveApiKeyToLocalStorage is async, so wait for its completion
      await jest.runAllTimersAsync(); // Resolve promises from save
      await element.updateComplete;

      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toContain('API Key Saved');

      jest.advanceTimersByTime(2500); // Message duration
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('Paste API Key Button (with Transient Msg Check)', () => {
    test('successful paste shows transient "API Key Saved"', async () => {
      jest.useFakeTimers();
      element['geminiApiKey'] = null;
      element['apiKeyInvalid'] = true;
      await element.updateComplete;
      const pasteButton = element.shadowRoot?.querySelector('.api-controls button');

      const pastedKey = 'pasted-key-transient';
      clipboardReadTextSpy.mockResolvedValue(pastedKey);

      pasteButton!.click();
      await jest.runAllTimersAsync(); // Resolve promises from paste and save
      await element.updateComplete;

      expect(element['geminiApiKey']).toBe(pastedKey);
      expect(element['transientApiKeyStatusMessage']).toBe('API Key Saved');
      expect(getApiKeyStatusMessage()).toContain('API Key Saved');

      jest.advanceTimersByTime(2500);
      await element.updateComplete;
      expect(element['transientApiKeyStatusMessage']).toBeNull();
      jest.useRealTimers();
    });
  });

});

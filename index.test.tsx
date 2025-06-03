import { html, fixture, expect, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import { PromptDjMidi } from './index';
import { MidiDispatcher } from './utils/MidiDispatcher';

describe('PromptDjMidi - API Key Management', () => {
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

  // Spy for component's own method for finer control
  let saveApiKeyToLocalStorageSpy: jest.SpyInstance;


  beforeEach(async () => {
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

    // Mock navigator.clipboard
    // Ensure a default implementation for clipboardReadTextSpy
    clipboardReadTextSpy = jest.fn().mockResolvedValue('default-clipboard-text');
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: clipboardReadTextSpy,
      },
      configurable: true,
      writable: true,
    });

    element = new PromptDjMidi(new Map(), mockMidiDispatcher);

    // Spy on actual instance methods AFTER element creation
    // We spy on the real method to see if it's called, but also allow its execution.
    saveApiKeyToLocalStorageSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
    // handleMainAudioButton is called by saveApiKeyToLocalStorage, mock it to simplify tests
    jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});


    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
    jest.restoreAllMocks();
    jest.useRealTimers(); // Ensure real timers are restored
  });

  describe('Initial Load & Basic Save', () => {
    test('initial load - no API key in localStorage, UI reflects no key', async () => {
      expect(localStorageGetItemSpy).toHaveBeenCalledWith('geminiApiKey');
      expect(element['apiKeySavedSuccessfully']).toBe(false);
      await element.updateComplete;
      const statusMessage = element.shadowRoot?.textContent;
      expect(statusMessage).not.toContain('API Key Saved & Verified');
      // It might show "API Key Cleared" if geminiApiKey is null and not saved, which is the default
      expect(statusMessage).toContain('API Key Cleared');
    });

    test('initial load - API key exists and is verified, UI reflects verified', async () => {
      const testKey = 'verified-key';
      localStorageGetItemSpy.mockReturnValue(testKey);

      if (element.parentNode) element.parentNode.removeChild(element); // Clean up previous
      element = new PromptDjMidi(new Map(), mockMidiDispatcher); // Re-instantiate
      jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
      saveApiKeyToLocalStorageSpy = jest.spyOn(element as any, 'saveApiKeyToLocalStorage');
      document.body.appendChild(element);
      await element.updateComplete;

      expect(element['geminiApiKey']).toBe(testKey);
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      const statusMessage = element.shadowRoot?.textContent;
      expect(statusMessage).toContain('API Key Saved & Verified');
    });

    test('localStorage is unavailable during save, UI shows error', async () => {
      const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

      element['geminiApiKey'] = 'test-key';
      await element.saveApiKeyToLocalStorage(); // Call directly

      expect(element['apiKeyInvalid']).toBe(true);
      await element.updateComplete;
      expect(element.shadowRoot?.textContent).toContain('localStorage not available. API Key cannot be saved.');

      if(originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
    });
  });

  describe('Debounced Autosave on Input', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test('input change calls debounced saveApiKeyToLocalStorage', async () => {
      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;
      expect(apiKeyInput).not.toBeNull();

      apiKeyInput.value = 'new-key';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      expect(saveApiKeyToLocalStorageSpy).not.toHaveBeenCalled(); // Not called immediately

      jest.advanceTimersByTime(500); // Advance past debounce delay

      expect(saveApiKeyToLocalStorageSpy).toHaveBeenCalledTimes(1);
      await element.updateComplete; // Wait for state changes from save to reflect
      // Assuming save is successful
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element.shadowRoot?.textContent).toContain('API Key Saved & Verified');
    });

    test('multiple input changes trigger only one save call after last debounce', async () => {
      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;
      apiKeyInput.value = 'key1';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      jest.advanceTimersByTime(200); // Less than debounce

      apiKeyInput.value = 'key12';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      jest.advanceTimersByTime(200); // Less than debounce

      apiKeyInput.value = 'key123';
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      expect(saveApiKeyToLocalStorageSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500); // Past debounce of last input
      expect(saveApiKeyToLocalStorageSpy).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
      jest.useRealTimers();
    });
  });

  describe('Paste API Key Button', () => {
    let pasteButton: HTMLButtonElement | null | undefined;

    beforeEach(async () => {
      // The button only appears if !this.geminiApiKey or this.apiKeyInvalid
      element['geminiApiKey'] = null; // Ensure condition for button to be visible
      element['apiKeyInvalid'] = true; // Or this
      await element.updateComplete;
      pasteButton = element.shadowRoot?.querySelector('.api-controls button');
      expect(pasteButton).not.toBeNull();
      expect(pasteButton?.textContent).toBe('Paste API key');
    });

    test('successful paste and immediate save', async () => {
      const pastedKey = 'pasted-api-key';
      clipboardReadTextSpy.mockResolvedValue(pastedKey);
      localStorageSetItemSpy.mockClear(); // Clear from potential earlier calls in other tests

      pasteButton!.click();
      await element.updateComplete; // Wait for async operations in handler

      expect(clipboardReadTextSpy).toHaveBeenCalledTimes(1);
      expect(element['geminiApiKey']).toBe(pastedKey);

      const apiKeyInput = element.shadowRoot?.querySelector('input[type="text"]') as HTMLInputElement;
      expect(apiKeyInput.value).toBe(pastedKey);

      expect(saveApiKeyToLocalStorageSpy).toHaveBeenCalledTimes(1); // Direct call
      expect(localStorageSetItemSpy).toHaveBeenCalledWith('geminiApiKey', pastedKey);
      expect(element['apiKeySavedSuccessfully']).toBe(true);
      expect(element.shadowRoot?.textContent).toContain('API Key Saved & Verified');
    });

    test('clipboard API unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

      pasteButton!.click();
      await element.updateComplete;

      expect(consoleWarnSpy).toHaveBeenCalledWith('Clipboard API not available or readText not supported.');
      expect(saveApiKeyToLocalStorageSpy).not.toHaveBeenCalled();
    });

    test('clipboard read error (permission denied)', async () => {
      clipboardReadTextSpy.mockRejectedValue(new Error('Permission denied'));

      pasteButton!.click();
      await element.updateComplete;

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to read from clipboard:', expect.any(Error));
      expect(saveApiKeyToLocalStorageSpy).not.toHaveBeenCalled();
    });

    test('empty or whitespace clipboard', async () => {
      clipboardReadTextSpy.mockResolvedValue('   '); // Whitespace

      pasteButton!.click();
      await element.updateComplete;

      expect(consoleWarnSpy).toHaveBeenCalledWith('Clipboard is empty or contains only whitespace.');
      expect(saveApiKeyToLocalStorageSpy).not.toHaveBeenCalled(); // Or if it was, it was with an empty key leading to removal
      // Check if geminiApiKey state remains unchanged or becomes null
      // expect(element['geminiApiKey']).toBeNull(); // Depending on desired behavior
    });
  });

  describe('UI Messages Refined', () => {
    test('UI shows "API Key Cleared" when key is null and not saved', async () => {
      element['geminiApiKey'] = null;
      element['apiKeySavedSuccessfully'] = false;
      await element.updateComplete;
      expect(element.shadowRoot?.textContent).toContain('API Key Cleared');
    });

    test('UI shows "Verifying or attempting to save API Key..." when key present but not saved/verified', async () => {
      element['geminiApiKey'] = 'some-key';
      element['apiKeySavedSuccessfully'] = false;
      element['apiKeyInvalid'] = false;
      await element.updateComplete;
      expect(element.shadowRoot?.textContent).toContain('Verifying or attempting to save API Key...');
    });

    test('UI shows "API Key is invalid..." when apiKeyInvalid is true (generic case)', async () => {
        element['apiKeyInvalid'] = true;
        // Ensure localStorage is defined for this sub-test, to hit the generic invalid message
        const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
        if (!window.localStorage) { // If it was already undefined by a prior test in this suite.
            Object.defineProperty(window, 'localStorage', { value: Storage.prototype, configurable: true, writable: true });
        }

        await element.updateComplete;
        expect(element.shadowRoot?.textContent).toContain('API Key is invalid, failed to save, or auth failed.');

        if (originalLocalStorage && window.localStorage === undefined) { // Restore if we set it
             Object.defineProperty(window, 'localStorage', originalLocalStorage);
        } else if (!originalLocalStorage && window.localStorage !== undefined) { // If it was defined by us
            Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });
        }
    });
  });
});

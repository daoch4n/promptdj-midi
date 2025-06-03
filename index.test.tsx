import { html, fixture, expect, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import { PromptDjMidi } from './index'; // Adjust if class name/export is different
import { MidiDispatcher } from './utils/MidiDispatcher'; // Mock this if necessary

// Helper function to create and wait for the element to update
async function fixtureCleanup<T extends HTMLElement>(template: unknown): Promise<T> {
  const el = await fixture(template) as T;
  await el.updateComplete; // Ensure LitElement lifecycle is complete
  return el;
}

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

  // Mock for methods on the class itself if needed
  let handleMainAudioButtonSpy: jest.SpyInstance;
  // let connectToSessionSpy: jest.SpyInstance; // Usually not needed if handleMainAudioButton is fully mocked


  beforeEach(async () => {
    // Mock MidiDispatcher
    mockMidiDispatcher = {
      getMidiAccess: jest.fn().mockResolvedValue([]),
      activeMidiInputId: null,
      getDeviceName: jest.fn().mockReturnValue('Mock MIDI Device'),
      on: jest.fn(), // Add other methods if PromptDjMidi calls them during init or tested methods
      off: jest.fn(),
    } as unknown as MidiDispatcher;

    // Spy on localStorage methods BEFORE element instantiation if constructor uses them
    localStorageGetItemSpy = jest.spyOn(Storage.prototype, 'getItem');
    localStorageSetItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    localStorageRemoveItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

    // Default mock implementations
    localStorageGetItemSpy.mockReturnValue(null); // Default to no key in storage
    localStorageSetItemSpy.mockImplementation(() => {}); // Default to successful set
    localStorageRemoveItemSpy.mockImplementation(() => {}); // Default to successful remove

    // Spy on console methods
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Instantiate the element. This will call the constructor.
    element = new PromptDjMidi(new Map(), mockMidiDispatcher);

    // Spy on methods of the instance AFTER instantiation
    // Mocking handleMainAudioButton as its full logic isn't tested here.
    // The API key methods call it at the end, so we need to control its behavior.
    handleMainAudioButtonSpy = jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {
      // Simulate that connectToSession might be called within handleMainAudioButton
      // And it might set apiKeyInvalid or connectionError based on its outcome.
      // For most API key saving tests, we assume connection will be fine if key is fine.
      if (element['ai'] && !element['geminiApiKey']){ // If AI was init but key is now gone
         // element['apiKeyInvalid'] = true; // This might be set by a real connectToSession
      }
    });

    // Add element to the DOM to allow Lit an update cycle.
    // This is important for `updateComplete` and for querying shadow DOM.
    document.body.appendChild(element);
    await element.updateComplete; // Wait for initial render and updates from constructor
  });

  afterEach(() => {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
    jest.restoreAllMocks();
  });

  test('initial load - no API key in localStorage', async () => {
    // constructor called in beforeEach, localStorageGetItemSpy already configured to return null
    // checkApiKeyStatus is called in constructor
    expect(localStorageGetItemSpy).toHaveBeenCalledWith('geminiApiKey');
    expect(element['apiKeySavedSuccessfully']).toBe(false);

    await element.updateComplete; // ensure UI reflects this state
    const statusMessage = element.shadowRoot?.textContent;
    expect(statusMessage).not.toContain('API Key Saved');
    expect(statusMessage).not.toContain('API Key Verified');
  });

  test('initial load - API key exists in localStorage and is verified', async () => {
    const testKey = 'test-api-key-from-storage';
    localStorageGetItemSpy.mockReturnValue(testKey); // Configure spy BEFORE instantiation

    // Re-instantiate for a clean test of the constructor path
    if (element.parentNode) element.parentNode.removeChild(element); // Clean up previous
    element = new PromptDjMidi(new Map(), mockMidiDispatcher);
    handleMainAudioButtonSpy = jest.spyOn(element as any, 'handleMainAudioButton').mockImplementation(async () => {});
    document.body.appendChild(element);
    await element.updateComplete;

    expect(localStorageGetItemSpy).toHaveBeenCalledWith('geminiApiKey');
    expect(element['geminiApiKey']).toBe(testKey);
    expect(element['apiKeySavedSuccessfully']).toBe(true);

    await element.updateComplete;
    const successMsg = element.shadowRoot?.textContent?.includes('API Key Verified');
    expect(successMsg).toBe(true);
  });

  test('localStorage is unavailable during save attempt', async () => {
    // Undefine localStorage globally for this test
    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });

    element['geminiApiKey'] = 'test-key';
    await element.saveApiKeyToLocalStorage(); // This calls checkApiKeyStatus at the end

    expect(consoleWarnSpy).toHaveBeenCalledWith('localStorage is not available. Cannot save or remove Gemini API key from localStorage.');
    expect(element['apiKeyInvalid']).toBe(true);
    expect(element['connectionError']).toBe(true);
    expect(element['apiKeySavedSuccessfully']).toBe(false); // checkApiKeyStatus will set this
    expect(handleMainAudioButtonSpy).toHaveBeenCalled();

    // Restore localStorage
    if(originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
  });

  test('API key saving succeeds on the first try', async () => {
    const testKey = 'test-key-save-success';
    element['geminiApiKey'] = testKey;
    // localStorageSetItemSpy is already mocked to succeed by default

    await element.saveApiKeyToLocalStorage();
    // saveApiKeyToLocalStorage calls checkApiKeyStatus at the end.

    expect(localStorageSetItemSpy).toHaveBeenCalledTimes(1);
    expect(localStorageSetItemSpy).toHaveBeenCalledWith('geminiApiKey', testKey);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Gemini API key saved to local storage (attempt 1).`);
    expect(element['apiKeySavedSuccessfully']).toBe(true);
    expect(handleMainAudioButtonSpy).toHaveBeenCalled();

    await element.updateComplete;
    const successMsg = element.shadowRoot?.textContent?.includes('API Key Saved');
    expect(successMsg).toBe(true);
  });

  test('API key saving succeeds after retries (e.g., on 3rd try)', async () => {
    const testKey = 'test-key-retry-success';
    element['geminiApiKey'] = testKey;

    jest.useFakeTimers(); // Use fake timers for setTimeout

    localStorageSetItemSpy
      .mockImplementationOnce(() => { throw new Error('Simulated localStorage error 1'); })
      .mockImplementationOnce(() => { throw new Error('Simulated localStorage error 2'); })
      .mockImplementationOnce(() => {}); // Success on the third try

    const savePromise = element.saveApiKeyToLocalStorage();

    // Advance timers for the first two failed attempts
    await jest.advanceTimersByTimeAsync(1000); // Delay after 1st failure
    await jest.advanceTimersByTimeAsync(2000); // Delay after 2nd failure

    await savePromise; // Wait for the save process to complete
    await element.updateComplete;

    expect(localStorageSetItemSpy).toHaveBeenCalledTimes(3);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Attempt 1 to save API key failed.'), expect.any(Error));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Attempt 2 to save API key failed.'), expect.any(Error));
    expect(consoleLogSpy).toHaveBeenCalledWith(`Gemini API key saved to local storage (attempt 3).`);
    expect(element['apiKeySavedSuccessfully']).toBe(true);
    expect(handleMainAudioButtonSpy).toHaveBeenCalled();

    const successMsg = element.shadowRoot?.textContent?.includes('API Key Saved');
    expect(successMsg).toBe(true);

    jest.useRealTimers(); // Restore real timers
  });

  test('API key saving fails after all retries', async () => {
    const testKey = 'test-key-retry-fail';
    element['geminiApiKey'] = testKey;
    const maxRetries = element['maxRetries'] || 3; // Accessing private member for test clarity

    jest.useFakeTimers();
    localStorageSetItemSpy.mockImplementation(() => { throw new Error('Simulated consistent localStorage error'); });

    const savePromise = element.saveApiKeyToLocalStorage();

    for (let i = 0; i < maxRetries; i++) {
      await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, i) + 100); // Advance past each backoff
    }
    await savePromise;
    await element.updateComplete;

    expect(localStorageSetItemSpy).toHaveBeenCalledTimes(maxRetries);
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to save API key after ${maxRetries} attempts.`);
    expect(element['apiKeySavedSuccessfully']).toBe(false);
    expect(element['apiKeyInvalid']).toBe(true);
    expect(element['connectionError']).toBe(true);
    expect(handleMainAudioButtonSpy).toHaveBeenCalled();

    const failMsg = element.shadowRoot?.textContent?.includes('API Key is invalid');
    expect(failMsg).toBe(true); // Check for specific failure message related to apiKeyInvalid

    jest.useRealTimers();
  });

  test('API key removal when geminiApiKey is set to null', async () => {
    // Simulate key was initially present
    localStorageGetItemSpy.mockReturnValue('existing-key');
    element['geminiApiKey'] = 'existing-key'; // Simulate it was loaded
    await element.updateComplete;
    element['geminiApiKey'] = null; // User clears the key
    await element.updateComplete;

    await element.saveApiKeyToLocalStorage(); // Attempt to "save" the null key (which means remove)

    expect(localStorageRemoveItemSpy).toHaveBeenCalledTimes(1);
    expect(localStorageRemoveItemSpy).toHaveBeenCalledWith('geminiApiKey');
    expect(consoleLogSpy).toHaveBeenCalledWith('Gemini API key removed from local storage.');
    expect(element['apiKeySavedSuccessfully']).toBe(false);
    expect(handleMainAudioButtonSpy).toHaveBeenCalled();

    await element.updateComplete;
    const clearedMsg = element.shadowRoot?.textContent?.includes('API Key Cleared');
    expect(clearedMsg).toBe(true);
  });

  test('checkApiKeyStatus correctly identifies unsaved key', async () => {
    element['geminiApiKey'] = 'unsaved-key';
    localStorageGetItemSpy.mockReturnValue(null); // No key in storage

    (element as any).checkApiKeyStatus(); // Call directly for this specific test
    await element.updateComplete;

    expect(element['apiKeySavedSuccessfully']).toBe(false);
    const statusMessage = element.shadowRoot?.textContent;
    expect(statusMessage).toContain('Unsaved Key'); // Assuming this message is shown near input
    expect(statusMessage).toContain('API Key entered but not saved. Click Save.'); // General status
  });

  test('checkApiKeyStatus correctly identifies mismatched key', async () => {
    element['geminiApiKey'] = 'active-key';
    localStorageGetItemSpy.mockReturnValue('stored-different-key'); // Different key in storage

    (element as any).checkApiKeyStatus();
    await element.updateComplete;

    expect(element['apiKeySavedSuccessfully']).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('API key verification failed. Stored key does not match active key, or key needs saving.');
    // UI should reflect it's not "Saved" or "Verified"
    const statusMessage = element.shadowRoot?.textContent;
    expect(statusMessage).not.toContain('API Key Saved');
    expect(statusMessage).not.toContain('API Key Verified');
    expect(statusMessage).toContain('Unsaved Key'); // Or similar indication that current key isn't the one in storage
  });
});

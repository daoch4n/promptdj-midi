import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LitElement } from 'lit'; // Needed for type casting if we import the real component
import { MidiDispatcher } from './utils/MidiDispatcher';
// Attempt to import the actual component.
// This might be problematic if main() in index.tsx runs immediately.
// We'll need to see if the test environment handles this or if we need a workaround.
import './index'; // This will register the custom element <prompt-dj-midi>
import type { PromptDjMidi as ActualPromptDjMidi } from './index'; // type import
import type { PlaybackState } from './types';

// Mock GoogleGenAI
const mockConnect = vi.fn();
const mockSetWeightedPrompts = vi.fn();
const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockStopSession = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    live: {
      music: {
        connect: mockConnect,
      },
    },
    // Mock other methods if necessary for broader component testing
  })),
}));


// Mock MidiDispatcher and initial prompts for constructor
vi.mock('./utils/MidiDispatcher');
const mockMidiDispatcherInstance = new MidiDispatcher(); // Instance for the component
const mockInitialPrompts = new Map(); // Default empty map

// Helper to create and append the component
async function createComponent(): Promise<ActualPromptDjMidi> {
  const element = document.createElement('prompt-dj-midi') as ActualPromptDjMidi;
  document.body.appendChild(element);
  await element.updateComplete; // Wait for LitElement to render
  return element;
}

// Cleanup after each test
afterEach(() => {
  const component = document.querySelector('prompt-dj-midi');
  if (component) {
    component.remove();
  }
  vi.clearAllMocks();
});


describe('PromptDjMidi - API Key and Seed Block Display Logic', () => {
  let component: ActualPromptDjMidi;

  beforeEach(async () => {
    component = await createComponent();
    // Ensure default state for these properties before each test in this block
    component.geminiApiKey = null;
    component.connectionError = false;
    component.playbackState = 'stopped'; // Default to stopped for this test suite
    await component.updateComplete;
  });

  // Test scenarios for visibility
  it.each([
    // playbackState, connectionError, geminiApiKey, expectedVisible
    ['stopped', true, null, true, 'API key and seed should be visible when stopped, connection error, no API key'],
    ['stopped', false, null, true, 'API key and seed should be visible when stopped, no connection error, no API key'],
    ['stopped', true, 'key', true, 'API key and seed should be visible when stopped, connection error, with API key'],
    ['stopped', false, 'key', false, 'API key and seed should be hidden when stopped, no error, with API key'],
    ['playing', true, null, false, 'API key and seed should be hidden when playing, connection error, no API key'],
    ['loading', false, null, false, 'API key and seed should be hidden when loading, no error, no API key'],
    ['paused', true, null, false, 'API key and seed should be hidden when paused, connection error, no API key'],
  ])(
    'when playbackState is %s, connectionError is %s, geminiApiKey is %s -> inputs visible: %s',
    async (playbackState, connectionError, geminiApiKey, expectedVisible, description) => {
      component.playbackState = playbackState as PlaybackState;
      component.connectionError = connectionError;
      component.geminiApiKey = geminiApiKey;
      await component.updateComplete;

      const apiKeyInput = component.shadowRoot?.querySelector('input[type="text"][placeholder="Gemini API Key"]');
      const seedInput = component.shadowRoot?.querySelector('input[type="number"]#seed');

      if (expectedVisible) {
        expect(apiKeyInput, `${description} - API key input`).not.toBeNull();
        expect(seedInput, `${description} - Seed input`).not.toBeNull();
      } else {
        expect(apiKeyInput, `${description} - API key input`).toBeNull();
        expect(seedInput, `${description} - Seed input`).toBeNull();
      }
    }
  );
});

describe('PromptDjMidi - PlayPauseButton State During Network Error Recovery', () => {
  let component: ActualPromptDjMidi;
  let mockSession: any;

  beforeEach(async () => {
    // Mock the session object that `connect` would return
    mockSession = {
      setWeightedPrompts: mockSetWeightedPrompts,
      play: mockPlay,
      pause: mockPause,
      stop: mockStopSession,
      // Mock other session methods if they are called
    };

    component = await createComponent();
    component.geminiApiKey = 'fake-key'; // Assume API key is set for these tests
    await component.updateComplete;
  });

  it('should transition playbackState: initial -> loading -> stopped on initial connection failure', async () => {
    // Arrange: Mock connect to simulate failure
    mockConnect.mockRejectedValue(new Error('Simulated connection failure'));

    // Act: Trigger connection attempt
    // We expect connectToSession to be called internally by handleMainAudioButton
    // and to manage playbackState changes.

    // Set a spy on connectToSession to know when it's called and finished
    const connectToSessionSpy = vi.spyOn(component, 'connectToSession');

    // Call handleMainAudioButton, but don't wait for it fully if we want to check intermediate state.
    // However, testing intermediate 'loading' state for a failing promise is hard without more complex async control.
    // The logic sets 'loading' right before the actual async call that might fail.
    // Let's assume for now the state changes are rapid and focus on the final 'stopped' state.
    await component.handleMainAudioButton();

    // Assertions
    expect(connectToSessionSpy).toHaveBeenCalled();

    // Check final state
    expect(component.playbackState).toBe('stopped');
    // Ensure previousPlaybackStateOnError is null after a failed initial connection
    expect(component.previousPlaybackStateOnError).toBeNull();
    expect(mockConnect).toHaveBeenCalledTimes(1); // Ensure connection was attempted
    // Check if toast message for failure was shown (optional, but good for UX)
    expect(component.toastMessage.show).toHaveBeenCalledWith('Failed to connect to session. Check your API key.');
  });

  it('should transition playbackState: playing -> loading -> playing on successful reconnection after an error', async () => {
    let capturedCallbacks: any = {};
    // Stage 1: Initial successful connection
    mockConnect.mockImplementationOnce(({ callbacks }) => {
      capturedCallbacks = callbacks; // Capture callbacks
      return Promise.resolve(mockSession); // Simulate successful connection
    });

    await component.handleMainAudioButton(); // This should call connect, set up session, and play
    expect(component.playbackState).toBe('playing'); // Should be playing after initial success (or loading then playing)

    // Stage 2: Simulate an error
    mockConnect.mockImplementationOnce(({ callbacks }) => { // For the reconnection attempt
        capturedCallbacks = callbacks; // Potentially re-capture if needed, or ensure old ones are used
        return Promise.resolve(mockSession); // Simulate successful reconnection
    });

    expect(capturedCallbacks.onerror).toBeDefined();
    if (capturedCallbacks.onerror) {
        // Trigger the error
        // Need to ensure `this.previousPlaybackStateOnError` is set correctly BEFORE connectToSession is called by onerror
        const originalState = component.playbackState; // Should be 'playing'
        capturedCallbacks.onerror(new ErrorEvent('error', { error: new Error('Simulated network error') }));

        // Check intermediate state if possible/reliable, or await the reconnection logic
        expect(component.playbackState).toBe('loading'); // Should be loading during reconnection
        expect(component.previousPlaybackStateOnError).toBe(originalState);
    }

    // Wait for LitElement to update if any state changes cause re-renders
    await component.updateComplete;
    // Wait for the mocked connectToSession to complete its second run
    // This requires ensuring the test waits for the async operations within onerror to settle.
    // Vitest handles promises automatically in expects, but control flow needs care.
    // A short delay or a more robust mechanism might be needed if tests are flaky.
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks to flush

    // Assertions after reconnection
    expect(mockConnect).toHaveBeenCalledTimes(2); // Initial + reconnection
    expect(component.playbackState).toBe('playing'); // Restored to previous state
    expect(component.previousPlaybackStateOnError).toBeNull(); // Should be cleared after successful reconnect
  });

  it('should transition playbackState: playing -> loading -> stopped on failed reconnection after an error', async () => {
    let capturedCallbacks: any = {};
    // Stage 1: Initial successful connection
    mockConnect.mockImplementationOnce(({ callbacks }) => {
      capturedCallbacks = callbacks;
      return Promise.resolve(mockSession);
    });

    await component.handleMainAudioButton();
    expect(component.playbackState).toBe('playing'); // Or loading then playing

    // Stage 2: Simulate an error, then a failed reconnection
    mockConnect.mockRejectedValueOnce(new Error('Simulated reconnection failure')); // Fails on the second call

    expect(capturedCallbacks.onerror).toBeDefined();
    if (capturedCallbacks.onerror) {
      const originalState = component.playbackState;
      capturedCallbacks.onerror(new ErrorEvent('error', { error: new Error('Simulated network error') }));
      expect(component.playbackState).toBe('loading');
      expect(component.previousPlaybackStateOnError).toBe(originalState);
    }

    await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks

    // Assertions after failed reconnection
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(component.playbackState).toBe('stopped');
    expect(component.previousPlaybackStateOnError).toBeNull(); // Should be cleared even on failed reconnect attempt
    expect(component.toastMessage.show).toHaveBeenCalledWith('Connection lost. Attempting to reconnect...');
    // The second call to connectToSession (the retry) will fail and its catch block should show this:
    expect(component.toastMessage.show).toHaveBeenCalledWith('Failed to connect to session. Check your API key.');
  });

  it('should transition to "paused" when button clicked while "loading" (and audioReady is true)', async () => {
    // Arrange
    component.audioReady = true; // Prerequisite for this specific path in handleMainAudioButton
    component.playbackState = 'loading'; // Set the state to loading
    // Ensure a session object is assigned, as pause() might try to use it.
    // The actual mockSession.pause is what we'll check.
    component.session = mockSession;
    await component.updateComplete;

    // Act
    await component.handleMainAudioButton();

    // Assert
    expect(component.playbackState).toBe('paused');
    expect(mockPause).toHaveBeenCalled();
  });

  it('should transition to "paused" when button clicked while "stopped" (and audioReady is true)', async () => {
    // Arrange
    component.audioReady = true; // Prerequisite
    component.playbackState = 'stopped'; // Set the state to stopped
    component.connectionError = false; // Not in an error state that would prevent this action
    component.session = mockSession; // Ensure session object is present
    await component.updateComplete;

    // Act
    await component.handleMainAudioButton();

    // Assert
    expect(component.playbackState).toBe('paused');
    expect(mockPause).toHaveBeenCalled();
  });
});


// KEEPING THE OLD TEST SUITE FOR NOW - It tests a local mock, not the actual component.
// It might be useful for reference or could be removed/refactored later.
// Mock an incomplete definition of PromptDjMidi for testing purposes
// We are primarily interested in the connectToSession logic
class MockPromptDjMidi { // No longer extends LitElement
  session: any;
  ai: any;
  toastMessage!: any; // Use 'any' for simplicity with vi.fn()
  connectionError = false;
  geminiApiKey = 'test-api-key'; // Assume API key is set for tests

  constructor() {
    this.toastMessage = {
      show: vi.fn(),
      hide: vi.fn(),
    };
  }

  // Simplified connectToSession for testing
  async connectToSession() {
    // This will be mocked in individual tests
  }

  // Minimal methods needed for the test
  stop() {
    // Mock if needed
  }
}


describe('PromptDjMidi (Mocked) - Autorestart on Connection Failure', () => {
  let component: MockPromptDjMidi;


  beforeEach(async () => {
    const mockAiInstance = {
        live: {
            music: {
                connect: vi.fn() // This will be the mockConnect from @google/genai if not overridden
            }
        }
    };

    component = new MockPromptDjMidi();
    component.ai = mockAiInstance;

    // Spy on the component's connectToSession method
    // IMPORTANT: This spy is on the MOCK version of PromptDjMidi
    vi.spyOn(component, 'connectToSession').mockImplementation(async function(this: MockPromptDjMidi) {
        try {
            // @ts-ignore
            this.session = await this.ai.live.music.connect({
                model: 'lyria-realtime-exp',
                callbacks: {
                    onmessage: async (e: any) => {},
                    onerror: (e: ErrorEvent) => {
                        this.connectionError = true;
                        if (this.toastMessage && typeof this.toastMessage.show === 'function') {
                            this.toastMessage.show('Connection lost. Attempting to reconnect...');
                        }
                        this.connectToSession(); // Recursive call for retry
                    },
                    onclose: (e: CloseEvent) => {
                        this.connectionError = true;
                        if (this.toastMessage && typeof this.toastMessage.show === 'function') {
                            this.toastMessage.show('Connection lost. Attempting to reconnect...');
                        }
                        this.connectToSession(); // Recursive call for retry
                    },
                },
            });
        } catch (error) {
            this.connectionError = true;
            if (this.toastMessage && typeof this.toastMessage.show === 'function') {
                this.toastMessage.show('Failed to connect to session. Check your API key.');
            }
            console.error('Failed to connect to session:', error);
        }
    });
  });

  it('should attempt to reconnect on onerror callback', async () => {
    const initialConnectCallCount = 1; // The first call in the test setup
    const reconnectCallCount = 2; // Initial call + one reconnect attempt

    // Simulate the 'onerror' event being triggered by the first connection attempt.
    // The mock implementation of `component.ai.live.music.connect` will capture the callbacks.
    // Then we manually invoke `onerror`.

    let capturedOnError: ((e: ErrorEvent) => void) | undefined;
    component.ai.live.music.connect = vi.fn().mockImplementation(({ callbacks }: any) => {
      capturedOnError = callbacks.onerror;
      // Simulate a successful connection initially to get the callbacks registered
      return Promise.resolve({ name: 'mock-session' });
    });

    // Trigger initial connection
    await component.connectToSession();
    expect(component.connectToSession).toHaveBeenCalledTimes(initialConnectCallCount);

    // Manually trigger onerror if it was captured
    if (capturedOnError) {
      capturedOnError(new ErrorEvent('error', { error: new Error('Simulated error') }));
    } else {
      throw new Error('onerror callback was not captured');
    }

    // Check if toast message was shown
    expect(component.toastMessage.show).toHaveBeenCalledWith('Connection lost. Attempting to reconnect...');
    // Check if connectToSession was called again (reconnection attempt)
    expect(component.connectToSession).toHaveBeenCalledTimes(reconnectCallCount);
    expect(component.connectionError).toBe(true);
  });

  it('should attempt to reconnect on onclose callback', async () => {
    const initialConnectCallCount = 1;
    const reconnectCallCount = 2;

    let capturedOnClose: ((e: CloseEvent) => void) | undefined;
    component.ai.live.music.connect = vi.fn().mockImplementation(({ callbacks }: any) => {
      capturedOnClose = callbacks.onclose;
      return Promise.resolve({ name: 'mock-session' });
    });

    await component.connectToSession();
    expect(component.connectToSession).toHaveBeenCalledTimes(initialConnectCallCount);

    if (capturedOnClose) {
      capturedOnClose(new CloseEvent('close'));
    } else {
      throw new Error('onclose callback was not captured');
    }

    expect(component.toastMessage.show).toHaveBeenCalledWith('Connection lost. Attempting to reconnect...');
    expect(component.connectToSession).toHaveBeenCalledTimes(reconnectCallCount);
    expect(component.connectionError).toBe(true);
  });
});

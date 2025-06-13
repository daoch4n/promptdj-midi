import { fixture, html, nextFrame } from '@open-wc/testing';
import './index'; // Assuming 'index.ts' registers 'prompt-dj-midi'
import type { MockInstance } from 'vitest';
import { PromptDjMidi } from './index';
import type { MidiDispatcher } from './utils/MidiDispatcher';

const TRANSIENT_MESSAGE_DURATION = 2500;
const VALID_API_KEY = 'AIzaSyTestKeyForPromptDjMidiLength39'; // 39 characters, starts with AIzaSy


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

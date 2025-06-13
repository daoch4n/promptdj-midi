import { LitElement } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptController } from './PromptController';
import './WeightKnob'; // Import the actual WeightKnob component

describe('PromptController', () => {
  let controller: PromptController;
  let dispatchPromptChangeSpy: any;
  let dispatchEventSpy: any;

  beforeEach(async () => {
    controller = new PromptController();
    controller.promptId = 'test-prompt';
    controller.text = 'initial text';
    controller.cc = 10;
    controller.color = '#aabbcc';
    document.body.appendChild(controller);
    await controller.updateComplete;

    // Spy on internal methods
    // Cast to 'any' to access private methods for testing purposes
    dispatchPromptChangeSpy = vi.spyOn(
      controller as any,
      'dispatchPromptChange',
    );
    dispatchEventSpy = vi.spyOn(controller, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (controller.parentNode) {
      controller.parentNode.removeChild(controller);
    }
  });

  it('Scenario 1: Initial state (weight 0, isAutoFlowing false) -> toggle to true', () => {
    controller.weight = 0;
    controller.isAutoFlowing = false;

    controller.toggleAutoFlow(); // Accessing private method for test

    expect(controller.weight).toBe(1.0);
    expect(controller.isAutoFlowing).toBe(true);
    expect(dispatchPromptChangeSpy).toHaveBeenCalledTimes(1);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);

    const promptChangedEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-changed',
    )?.[0] as CustomEvent;
    expect(promptChangedEvent).toBeDefined();
    expect(promptChangedEvent.type).toBe('prompt-changed');
    expect(promptChangedEvent.detail).toEqual({
      promptId: 'test-prompt',
      text: controller.text,
      weight: 1.0,
      cc: controller.cc,
      color: controller.color,
    });

    const autoflowToggledEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-autoflow-toggled',
    )?.[0] as CustomEvent;

    expect(autoflowToggledEvent).toBeDefined();
    expect(autoflowToggledEvent.type).toBe('prompt-autoflow-toggled');
    expect(autoflowToggledEvent.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: true,
    });
  });

  it('Scenario 2: Auto active (weight 1, isAutoFlowing true) -> toggle to false (weight becomes 0)', () => {
    controller.weight = 1.0;
    controller.isAutoFlowing = true;
    // Set autoSetByButton to true as a precondition for weight to become 0.0
    (controller as any).autoSetByButton = true;

    controller.toggleAutoFlow();

    expect(controller.weight).toBe(0.0);
    expect(controller.isAutoFlowing).toBe(false);
    expect(dispatchPromptChangeSpy).toHaveBeenCalledTimes(1);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);

    const promptChangedEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-changed',
    )?.[0] as CustomEvent;
    expect(promptChangedEvent).toBeDefined();
    expect(promptChangedEvent.type).toBe('prompt-changed');
    expect(promptChangedEvent.detail).toEqual({
      promptId: 'test-prompt',
      text: controller.text,
      weight: 0.0,
      cc: controller.cc,
      color: controller.color,
    });

    const autoflowToggledEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-autoflow-toggled',
    )?.[0] as CustomEvent;

    expect(autoflowToggledEvent).toBeDefined();
    expect(autoflowToggledEvent.type).toBe('prompt-autoflow-toggled');
    expect(autoflowToggledEvent.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: false,
    });
  });

  it('Scenario 3: Initial state (weight 0.5, isAutoFlowing false) -> toggle to true', () => {
    controller.weight = 0.5;
    controller.isAutoFlowing = false;

    controller.toggleAutoFlow();

    expect(controller.weight).toBe(1.0);
    expect(controller.isAutoFlowing).toBe(true);
    expect(dispatchPromptChangeSpy).toHaveBeenCalledTimes(1);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);

    const promptChangedEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-changed',
    )?.[0] as CustomEvent;
    expect(promptChangedEvent).toBeDefined();
    expect(promptChangedEvent.type).toBe('prompt-changed');
    expect(promptChangedEvent.detail).toEqual({
      promptId: 'test-prompt',
      text: controller.text,
      weight: 1.0,
      cc: controller.cc,
      color: controller.color,
    });

    const autoflowToggledEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-autoflow-toggled',
    )?.[0] as CustomEvent;

    expect(autoflowToggledEvent).toBeDefined();
    expect(autoflowToggledEvent.type).toBe('prompt-autoflow-toggled');
    expect(autoflowToggledEvent.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: true,
    });
  });

  it('Scenario 4: Auto active (weight 0.7, isAutoFlowing true) -> toggle to false (weight remains 0.7)', () => {
    controller.weight = 0.7;
    controller.isAutoFlowing = true;

    controller.toggleAutoFlow();

    expect(controller.weight).toBe(0.7);
    expect(controller.isAutoFlowing).toBe(false);
    expect(dispatchPromptChangeSpy).toHaveBeenCalledTimes(1);

    // Expect dispatchEvent to be called twice: once for prompt-changed, once for prompt-autoflow-toggled
    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);

    const promptChangedEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-changed',
    )?.[0] as CustomEvent;
    expect(promptChangedEvent).toBeDefined();
    expect(promptChangedEvent.type).toBe('prompt-changed');
    expect(promptChangedEvent.detail).toEqual({
      promptId: 'test-prompt',
      text: controller.text,
      weight: 0.7, // Weight remains 0.7 in this scenario
      cc: controller.cc,
      color: controller.color,
    });

    // Find the 'prompt-autoflow-toggled' event among the dispatched events
    const autoflowToggledEvent = dispatchEventSpy.mock.calls.find(
      (callArgs: any[]) =>
        (callArgs[0] as CustomEvent).type === 'prompt-autoflow-toggled',
    )?.[0] as CustomEvent;

    expect(autoflowToggledEvent).toBeDefined();
    expect(autoflowToggledEvent.type).toBe('prompt-autoflow-toggled');
    expect(autoflowToggledEvent.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: false,
    });
  });
});

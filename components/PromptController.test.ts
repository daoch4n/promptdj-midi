import { LitElement } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptController } from './PromptController';

// Mock WeightKnob if it's a dependency that could cause issues
if (!customElements.get('weight-knob')) {
  customElements.define('weight-knob', class extends LitElement {});
}

describe('PromptController', () => {
  let controller: PromptController;
  let dispatchPromptChangeSpy: any;
  let dispatchEventSpy: any;

  beforeEach(async () => {
    controller = new PromptController();
    controller.promptId = 'test-prompt';
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

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('prompt-autoflow-toggled');
    expect(event.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: true,
    });
  });

  it('Scenario 2: Auto active (weight 1, isAutoFlowing true) -> toggle to false (weight becomes 0)', () => {
    controller.weight = 1.0;
    controller.isAutoFlowing = true;

    controller.toggleAutoFlow();

    expect(controller.weight).toBe(0.0);
    expect(controller.isAutoFlowing).toBe(false);
    expect(dispatchPromptChangeSpy).toHaveBeenCalledTimes(1);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('prompt-autoflow-toggled');
    expect(event.detail).toEqual({
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

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('prompt-autoflow-toggled');
    expect(event.detail).toEqual({
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

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('prompt-autoflow-toggled');
    expect(event.detail).toEqual({
      promptId: 'test-prompt',
      isAutoFlowing: false,
    });
  });
});

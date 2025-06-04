/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { WeightKnob } from './WeightKnob';
import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

const AUTO_ANIMATION_SMOOTHING_FACTOR = 0.02; // For slower animation

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    weight-knob {
      width: 70%;
      flex-shrink: 0;
    }
    #midi {
      text-align: center;
      font-size: 1.5vmin;
      border: 0.2vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 2px 5px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.75vmin;
      .learn-mode & {
        color: orange;
        border-color: orange;
      }
      .show-cc & {
        visibility: visible;
      }
    }
    #text {
      font-family: 'DS-Digital', cursive;
      font-weight: 600;
      font-size: 1rem;
      max-width: 100%;
      min-width: 2vmin;
      padding: 3px 6px;
      margin-top: calc(0.5vmin - 10px);
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: wrap;
      word-break: break-word;
      overflow: hidden;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      cursor: text; /* Indicate text input */
      transition: background 0.2s ease-in-out, color 0.2s ease-in-out, box-shadow 0.2s ease-in-out; /* Smooth transitions */
      &:not(:focus) {
        text-overflow: ellipsis;
      }
      &:focus {
        background: #333; /* Darker background on focus */
        border: 0.1vmin solid #fff; /* Subtle white border on focus */
      }
      &:hover:not(:focus) { /* Hover effect when not focused */
        background: #1a1a1a; /* Slightly lighter background on hover */
        color: #eee; /* Slightly darker text on hover */
        box-shadow: 0 0 0.5vmin rgba(255, 255, 255, 0.2); /* Subtle glow on hover */
      }
    }
    :host([filtered=true]) #text {
      background: #da2000;
    }
    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.3vmin;
      }
      weight-knob {
        width: 60%;
      }
    }

    .auto-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 0.75vmin;
    }
    .auto-button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
    }
    .auto-button.active {
      background-color: #fff;
      color: #000;
    }
    .auto-value-display {
      font-family: 'DS-Digital', cursive;
      font-size: 1.5vmin;
      color: #fff;
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 5px;
      border-radius: 0.25vmin;
      margin-top: 0.5vmin;
      min-width: 3ch;
      text-align: center;
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;
  @property({ type: Boolean }) isAutoFlowing = false;

  @state() private isFocused = false; // New state to track focus

  private lastValidText!: string;

  override connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        this.weight = (value / 127) * 2;
        this.dispatchPromptChange();
      }
    });
  }

  override firstUpdated() {
    // contenteditable is applied to textInput so we can "shrink-wrap" to text width
    // It's set here and not render() because Lit doesn't believe it's a valid attribute.
this.textInput.setAttribute('contenteditable', 'true');
this.textInput.addEventListener('paste', (e: ClipboardEvent) => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    document.execCommand('insertText', false, text);
  }
});

    // contenteditable will do weird things if this is part of the template.
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    // Only update textInput.textContent if not currently focused
    if (changedProperties.has('text') && this.textInput && !this.isFocused) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
      }),
    );
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.text = this.lastValidText;
      this.textInput.textContent = this.lastValidText;
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    this.isFocused = false; // Reset focus state on blur
  }

  private onFocus() {
    this.isFocused = true; // Set focus state on focus
    // .select() for contenteditable doesn't work.
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
}

private handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault(); // Prevent newline
    this.updateText(); // Save text
    this.textInput.blur(); // Remove focus
  }
}

private updateWeight() {
  this.weight = this.weightInput.value;
  this.dispatchPromptChange();
}

private toggleLearnMode() {
this.learnMode = !this.learnMode;
}

private toggleAutoFlow() {
  // Store the previous state and toggle this.isAutoFlowing
  const previousIsAutoFlowing = this.isAutoFlowing;
  this.isAutoFlowing = !this.isAutoFlowing;

  // Get the current weight
  const currentWeight = this.weight;

  if (this.isAutoFlowing) {
    // If auto-flow is now true, set weight to 1.0
    if (this.weightInput) { // Ensure weightInput is available
      this.weightInput.animateToValue(1.0, AUTO_ANIMATION_SMOOTHING_FACTOR);
    }
    this.weight = 1.0; // Update PromptController's state
  } else {
    // If auto-flow is now false, check if the knob's current value is approximately 1.0
    if (Math.abs(currentWeight - 1.0) < 0.001) {
      this.weight = 0.0;
    }
    // Otherwise, the weight remains as it was (or as set by other interactions)
  }

  // Dispatch the prompt change event
  this.dispatchPromptChange();

  // Dispatch the event with the new isAutoFlowing state
  this.dispatchEvent(
    new CustomEvent('prompt-autoflow-toggled', {
      detail: {
        promptId: this.promptId,
        isAutoFlowing: this.isAutoFlowing, // Use the new state
      },
      bubbles: true, // Important for event to reach PromptDjMidi
      composed: true, // Important for event to cross shadow DOM boundary
    })
  );
}

  override render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });
    return html`<div class=${classes}>
      <weight-knob
        id="weight"
        value=${this.weight}
        color=${this.color}
        audioLevel=${this.audioLevel}
        @input=${this.updateWeight}></weight-knob>
      <span
        id="text"
        spellcheck="false"
        @focus=${this.onFocus}
        @blur=${this.updateText}
        @keydown=${this.handleKeyDown}></span>
      <div class="auto-controls">
        <button
          id="autoButton"
          class="auto-button ${this.isAutoFlowing ? 'active' : ''}"
          @click=${this.toggleAutoFlow}>Auto</button>
        <div id="autoValueDisplay" class="auto-value-display">
          ${this.weight.toFixed(2)}
        </div>
      </div>
      <div id="midi" @click=${this.toggleLearnMode}>
        ${this.learnMode ? 'Learn' : `CC:${this.cc}`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}

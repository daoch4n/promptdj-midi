/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LitElement, css, html, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('record-button')
export class RecordButton extends LitElement {
  @property({ type: Boolean }) isRecording = false;

  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      cursor: pointer; /* Added cursor pointer to host */
    }
    :host(:hover) svg .base-circle-fill { /* Target specific part for hover */
      filter: brightness(1.2);
    }
    svg {
      width: 100%;
      height: 100%;
      transition: transform 0.5s cubic-bezier(0.25, 1.56, 0.32, 0.99); /* Keep existing transition */
    }
    .hitbox {
      pointer-events: all;
      position: absolute;
      width: 65%;
      aspect-ratio: 1;
      top: 9%; /* Match PlayPauseButton */
      border-radius: 50%;
      cursor: pointer;
    }
    .base-circle-fill {
      transition: filter 0.3s ease; /* Smooth brightness transition */
    }
    .loader {
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      animation: spin linear 1s infinite;
      transform-origin: center;
      transform-box: fill-box;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(359deg); }
    }
  `;

  private renderRecordSymbol() {
    const iconColor = '#FF0000'; // Always Red
    // For a record button, a simple circle is common.
    // Centered at (70,70) in a 140x140 viewBox. Radius can be adjusted.
    return svg`<circle cx="70" cy="70" r="30" fill="${iconColor}" />`;
  }

  private renderLoading() {
    return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
            l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
  }

  private renderSvg() {
    // Adapted from PlayPauseButton, using circles instead of rects for the base
    // viewBox is 0 0 140 140
    // Outer border circle
    // Background fill circle
    // Inner "button" fill circle
    return html` <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="70"
        cy="70"
        r="48"
        fill="#282828"
        class="base-circle-fill" />
      <circle
        cx="70"
        cy="70"
        r="46.5"
        stroke="#444"
        stroke-width="3" />
      <circle
        cx="70"
        cy="70"
        r="45"
        fill="#303030"
        class="base-circle-fill"
        shape-rendering="crispEdges" />
        ${this.isRecording ? this.renderLoading() : this.renderRecordSymbol()}
    </svg>`;
  }

  override render() {
    return html`${this.renderSvg()}<div class="hitbox" @click=${this.handleClick}></div>`;
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('record-click'));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'record-button': RecordButton;
  }
}

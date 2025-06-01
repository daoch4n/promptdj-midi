import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';

export interface DJStyleSelectorOption {
  value: string;
  label: string;
color?: string;
}

@customElement('dj-style-selector')
export class DJStyleSelector extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 5px;
    }
    .option {
      background-color: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
      font-size: 0.9em;
    }
    .option:hover {
      background-color: #444; /* Keep or slightly adjust for hover indication */
      /* Add a very subtle shadow using the option's color */
      box-shadow: 0 0 4px -1px var(--glow-color, #007bff);
    }
    .option.selected {
      background-color: var(--glow-color, #007bff); /* Use variable for inner color */
      box-shadow: 0 0 7px var(--glow-color, #007bff); /* Subtle outer glow */
      color: #fff;
      font-weight: bold;
    }
  `;

  @property({ type: Array })
  options: DJStyleSelectorOption[] = [];

  @property({ type: String })
  value: string = '';

  private _handleOptionClick(optionValue: string) {
    this.value = optionValue;
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: this.value,
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    return html`
      ${map(
        this.options,
        (option) => html`
          <div
            class="option ${option.value === this.value ? 'selected' : ''}"
            style="--glow-color: ${option.color || '#007bff'};"
            @click=${() => this._handleOptionClick(option.value)}
          >
            ${option.label}
          </div>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-style-selector': DJStyleSelector;
  }
}

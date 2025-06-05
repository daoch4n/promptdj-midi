import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('paste-button')
export class PasteButton extends LitElement {
  static override styles = css`
    button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: rgba(0, 0, 0, 0.4); /* Standardized black alpha */
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
    }
    button:hover {
      background-color: rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 5px -1px #007bff;
    }
  `;

  @state() private clipboardError: string | null = null;
  private clipboardErrorTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Callback function to be invoked when an API key is successfully pasted.
   * The pasted key will be passed as an argument to this function.
   */
  @property({ type: Function })
  onApiKeyPasted: (key: string) => void = () => {};

  private async handlePasteClick() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      this.setClipboardStatus(
        'Clipboard API not available or readText not supported.',
        3000,
      );
      console.warn('Clipboard API not available or readText not supported.');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        this.onApiKeyPasted(text.trim());
        this.setClipboardStatus('API Key pasted.', 2000);
        console.log('API Key pasted from clipboard.');
      } else {
        this.setClipboardStatus(
          'Clipboard is empty or contains only whitespace.',
          3000,
        );
        console.warn('Clipboard is empty or contains only whitespace.');
      }
    } catch (err) {
      this.setClipboardStatus(
        'Failed to paste from clipboard. Permission might be denied.',
        5000,
      );
      console.error('Failed to read from clipboard:', err);
    }
  }

  private setClipboardStatus(message: string, duration: number) {
    if (this.clipboardErrorTimeout) {
      clearTimeout(this.clipboardErrorTimeout);
    }
    this.clipboardError = message;
    this.clipboardErrorTimeout = setTimeout(() => {
      this.clipboardError = null;
      this.clipboardErrorTimeout = null;
    }, duration);
  }

  override render() {
    return html`
      <button @click=${this.handlePasteClick}>Paste API key</button>
      ${this.clipboardError ? html`<span style="color: yellow; margin-left: 5px;">${this.clipboardError}</span>` : ''}
    `;
  }
}

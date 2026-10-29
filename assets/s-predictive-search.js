
import { announceGlobalLiveRegion } from '@theme/live-region';

/**
 * <s-predictive-search> — Predictive search combobox controller.
 *
 * Implements the WAI-ARIA combobox pattern on top of <s-live-form>:
 * - Manages aria-expanded on the search input when results appear/disappear
 * - Arrow-key navigation through role="option" elements with aria-activedescendant
 * - Announces result count via the global #sr-announcer live region
 * - Enter on an active option navigates to its URL
 * - Escape clears the active option (second press closes the dialog natively)
 *
 * Required child markup (queried by ID / role):
 *   #predictive-search-input    — The text input; receives keydown + aria state.
 *   #predictive-search-listbox  — The results container; must host role="option" descendants.
 *   [role="option"]             — Each result row. Focusable children get tabindex=-1
 *                                  to preserve the combobox focus contract (WCAG 2.1.1).
 *   [role="option"][data-ps-url]        — Destination URL when Enter is pressed.
 *   [data-ps-result-count]              — sr-only element inside the listbox whose
 *                                          textContent is announced after each update.
 *
 * External events consumed:
 *   's-live-form:updated' — Emitted by enclosing <s-live-form>; triggers ARIA resync.
 *
 * External coupling:
 *   #sr-announcer (global) — live region for result-count announcements.
 *   Nesting: must live inside <s-dialog> so Escape bubbles correctly.
 */
class PredictiveSearch extends HTMLElement {
  #ac;
  #input;
  #listbox;
  #activeIndex = -1;

  connectedCallback() {
    this.#ac = new AbortController();
    const opts = { signal: this.#ac.signal };

    this.#refreshElements();

    if (!this.#input || !this.#listbox) return;

    // Listen for live-form updates to sync ARIA state
    this.addEventListener('s-live-form:updated', () => {
      this.#refreshElements();
      this.#syncExpandedState();
      this.#announceResults();
      this.#resetActiveOption();
      this.#removeFocusableDescendants();
    }, opts);

    // Keyboard navigation on the input
    this.#input.addEventListener('keydown', (e) => {
      this.#handleKeydown(e);
    }, opts);

    // Initial state sync (in case results are already rendered server-side)
    this.#syncExpandedState();
    this.#removeFocusableDescendants();
  }

  disconnectedCallback() {
    this.#ac?.abort();
  }

  get #options() {
    return this.#listbox ? [...this.#listbox.querySelectorAll('[role="option"]')] : [];
  }

  #refreshElements() {
    this.#input = this.querySelector('#predictive-search-input');
    this.#listbox = this.querySelector('#predictive-search-listbox');
  }

  /**
   * Remove focusable descendants inside role="option" elements from the tab
   * order. The combobox pattern requires keyboard focus to stay on the input;
   * inner links/buttons would break that contract (WCAG 2.1.1).
   */
  #removeFocusableDescendants() {
    if (!this.#listbox) return;
    for (const el of this.#listbox.querySelectorAll('[role="option"] a, [role="option"] button')) {
      el.setAttribute('tabindex', '-1');
    }
  }

  #syncExpandedState() {
    if (!this.#input || !this.#listbox) return;
    const hasOptions = this.#options.length > 0;
    this.#input.setAttribute('aria-expanded', String(hasOptions));
    // role="listbox" and aria-label are set statically in markup; only sync expanded state
  }

  #announceResults() {
    const countEl = this.#listbox?.querySelector('[data-ps-result-count]');
    if (!countEl) return;

    // Double-rAF to ensure the live region registers the post-partial change.
    announceGlobalLiveRegion(countEl.textContent.trim(), { frames: 2 });
  }

  #resetActiveOption() {
    this.#activeIndex = -1;
    if (this.#input) {
      this.#input.removeAttribute('aria-activedescendant');
    }
    for (const opt of this.#options) {
      opt.setAttribute('aria-selected', 'false');
    }
  }

  #setActiveOption(index) {
    const options = this.#options;
    if (options.length === 0) return;

    // Clear previous
    for (const opt of options) {
      opt.setAttribute('aria-selected', 'false');
    }

    // Wrap around
    if (index < 0) {
      index = options.length - 1;
    } else if (index >= options.length) {
      index = 0;
    }

    this.#activeIndex = index;
    const active = options[index];
    active.setAttribute('aria-selected', 'true');
    this.#input.setAttribute('aria-activedescendant', active.id);

    // Scroll the active option into view within the listbox
    active.scrollIntoView({ block: 'nearest' });
  }

  #handleKeydown(e) {
    const options = this.#options;
    if (options.length === 0 && e.key !== 'Escape') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#setActiveOption(this.#activeIndex + 1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.#setActiveOption(this.#activeIndex - 1);
        break;

      case 'Home':
        if (options.length > 0) {
          e.preventDefault();
          this.#setActiveOption(0);
        }
        break;

      case 'End':
        if (options.length > 0) {
          e.preventDefault();
          this.#setActiveOption(options.length - 1);
        }
        break;

      case 'Enter':
        if (this.#activeIndex >= 0 && this.#activeIndex < options.length) {
          e.preventDefault();
          const url = options[this.#activeIndex].dataset.psUrl;
          if (url) window.location.href = url;
        }
        // If no active option, let the form submit natively
        break;

      case 'Escape':
        if (this.#activeIndex >= 0) {
          e.preventDefault();
          e.stopPropagation();
          this.#resetActiveOption();
        }
        // If no active option, let the dialog handle Escape natively
        break;
    }
  }
}

customElements.define('s-predictive-search', PredictiveSearch);



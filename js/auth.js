/* ═══════════════════════════════════════════
   愈见 YuJian — Enhanced Auth Controller
   Animations, validation, login transitions
   ═══════════════════════════════════════════ */

const AuthAnim = {
  _overlay: null,

  init() {
    this._createSuccessOverlay();
  },

  _createSuccessOverlay() {
    if (this._overlay) return;
    this._overlay = document.createElement('div');
    this._overlay.className = 'login-success-overlay';
    this._overlay.innerHTML = `
      <div class="login-success-check">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="login-success-text">欢迎回来</div>
    `;
    document.body.appendChild(this._overlay);
  },

  showSuccess(name) {
    if (!this._overlay) this._createSuccessOverlay();
    const text = this._overlay.querySelector('.login-success-text');
    if (text) text.textContent = `欢迎${name ? '，' + name : '回来'}`;
    this._overlay.classList.add('active');

    setTimeout(() => {
      this._overlay.classList.remove('active');
    }, 1500);
  },

  setButtonLoading(btn, loading) {
    if (loading) {
      btn.classList.add('btn-loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  },

  shakeInput(input) {
    input.style.animation = 'none';
    input.offsetHeight; // Force reflow
    input.style.animation = 'inputShake 0.4s ease';
    input.style.borderColor = 'var(--rose)';
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.animation = '';
    }, 1000);
  }
};

// Add shake keyframes dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes inputShake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

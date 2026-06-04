/* ═══════════════════════════════════════════
   愈见 YuJian — Onboarding Flow
   ═══════════════════════════════════════════ */

const Onboarding = {
  _current: 0,
  _total: 3,
  _touchStartX: 0,
  _touchEndX: 0,

  init() {
    this._bindSwipe();
    this._bindKeys();
  },

  isCompleted() {
    return localStorage.getItem('yujian_onboarding_done') === '1';
  },

  complete() {
    localStorage.setItem('yujian_onboarding_done', '1');
    const screen = document.getElementById('onboarding-screen');
    if (screen) {
      screen.style.opacity = '0';
      screen.style.transform = 'scale(1.02)';
      setTimeout(() => {
        screen.classList.remove('active');
        screen.style.display = 'none';
        App._afterOnboarding();
      }, 400);
    }
  },

  skip() {
    this.complete();
  },

  next() {
    if (this._current < this._total - 1) {
      this._goTo(this._current + 1);
    } else {
      this.complete();
    }
  },

  prev() {
    if (this._current > 0) {
      this._goTo(this._current - 1);
    }
  },

  _goTo(index) {
    const slides = document.querySelectorAll('.ob-slide');
    const dots = document.querySelectorAll('.ob-dot');
    const footer = document.querySelector('.ob-footer');

    // Animate out current
    if (slides[this._current]) {
      slides[this._current].classList.remove('active');
      slides[this._current].classList.add('exiting');
      setTimeout(() => {
        if (slides[this._current]) slides[this._current].classList.remove('exiting');
      }, 500);
    }

    this._current = index;

    // Animate in new
    setTimeout(() => {
      if (slides[this._current]) {
        slides[this._current].classList.add('active');
      }
    }, 50);

    // Update dots
    dots.forEach((d, i) => d.classList.toggle('active', i === this._current));

    // Update footer buttons
    if (footer) {
      const nextBtn = footer.querySelector('.ob-next');
      const startBtn = footer.querySelector('.ob-start');
      if (this._current === this._total - 1) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (startBtn) startBtn.style.display = 'flex';
      } else {
        if (nextBtn) nextBtn.style.display = 'flex';
        if (startBtn) startBtn.style.display = 'none';
      }
    }
  },

  _bindSwipe() {
    const slides = document.querySelector('.ob-slides');
    if (!slides) return;

    slides.addEventListener('touchstart', (e) => {
      this._touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    slides.addEventListener('touchend', (e) => {
      this._touchEndX = e.changedTouches[0].screenX;
      const diff = this._touchStartX - this._touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) this.next();
        else this.prev();
      }
    }, { passive: true });
  },

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      const screen = document.getElementById('onboarding-screen');
      if (!screen || !screen.classList.contains('active')) return;
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'Escape') this.skip();
    });
  }
};

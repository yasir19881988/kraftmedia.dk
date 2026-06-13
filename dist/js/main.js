(function () {
  var doc = document.documentElement;
  doc.classList.remove('no-js');
  doc.classList.add('js');

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function revealElements() {
    var elements = document.querySelectorAll('.feature, .pricing-table-inner');
    if (!elements.length) {
      return;
    }

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      elements.forEach(function (element) {
        element.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    elements.forEach(function (element, index) {
      element.style.transitionDelay = String(index * 90) + 'ms';
      observer.observe(element);
    });
  }

  function animateHeroFigure() {
    var body = document.body;
    if (!body.classList.contains('has-animations')) {
      return;
    }

    var animatedBoxes = document.querySelectorAll('.hero-figure-box');
    if (!animatedBoxes.length) {
      return;
    }

    doc.classList.add('anime-ready');

    if (prefersReducedMotion()) {
      animatedBoxes.forEach(function (box) {
        box.style.opacity = '1';
        box.style.transform = box.dataset.finalTransform || '';
      });
      return;
    }

    animatedBoxes.forEach(function (box, index) {
      var computedTransform = window.getComputedStyle(box).transform;
      var finalTransform = computedTransform === 'none' ? '' : computedTransform;
      box.dataset.finalTransform = finalTransform;
      box.style.opacity = '0';
      box.style.transform = 'translateY(14px) scale(0.92)';
      box.style.transition = 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 500ms ease';
      box.style.transitionDelay = String(140 + index * 50) + 'ms';

      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          box.style.opacity = '1';
          box.style.transform = finalTransform;
        });
      });
    });
  }

  function initContactModal() {
    var modal = document.getElementById('contact-modal');
    var form = document.getElementById('contact-form');
    var submitButton = document.getElementById('contact-submit');
    var statusElement = document.getElementById('contact-form-status');
    var openButtons = document.querySelectorAll('[data-contact-open="true"]');
    var closeButtons = document.querySelectorAll('[data-contact-close="true"]');
    var lastActiveElement = null;
    var focusSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var minOpenDurationMs = 2000;

    if (!modal || !form || !submitButton || !statusElement) {
      return;
    }

    function openModal(triggerElement) {
      lastActiveElement = triggerElement || document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      var openedAtField = form.elements.opened_at;
      if (openedAtField) {
        openedAtField.value = String(Date.now());
      }

      statusElement.textContent = '';

      var focusableElements = modal.querySelectorAll(focusSelector);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
        lastActiveElement.focus();
      }
    }

    openButtons.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        openModal(button);
      });
    });

    closeButtons.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        closeModal();
      });
    });

    document.addEventListener('keydown', function (event) {
      if (!modal.classList.contains('is-open')) {
        return;
      }

      if (event.key === 'Escape') {
        closeModal();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      var focusableElements = Array.prototype.slice.call(modal.querySelectorAll(focusSelector));
      if (!focusableElements.length) {
        event.preventDefault();
        return;
      }

      var firstElement = focusableElements[0];
      var lastElement = focusableElements[focusableElements.length - 1];
      var activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var formData = new FormData(form);
      var payload = {
        name: (formData.get('name') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim(),
        phone: (formData.get('phone') || '').toString().trim(),
        website: (formData.get('website') || '').toString().trim(),
        message: (formData.get('message') || '').toString().trim(),
        company_name: (formData.get('company_name') || '').toString().trim(),
        opened_at: (formData.get('opened_at') || '').toString().trim()
      };

      var openedAt = Number(payload.opened_at || 0);
      if (!openedAt || (Date.now() - openedAt) < minOpenDurationMs) {
        statusElement.textContent = 'Please take a moment to review your message before sending.';
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
      statusElement.textContent = 'Sending your message...';

      try {
        var response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        var result = {};
        try {
          result = await response.json();
        } catch (error) {
          result = {};
        }

        if (!response.ok) {
          throw new Error(result.message || 'Unable to send your message right now.');
        }

        statusElement.textContent = result.message || 'Thanks! Your message was sent successfully.';
        form.reset();
        window.setTimeout(function () {
          closeModal();
        }, 700);
      } catch (error) {
        statusElement.textContent = error.message || 'Something went wrong. Please try again shortly.';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Send Message';
      }
    });
  }

  revealElements();
  animateHeroFigure();
  initContactModal();
}());

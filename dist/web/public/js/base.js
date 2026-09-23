/* ==================== PUBLIC WEBSITE JS ==================== */

document.addEventListener('DOMContentLoaded', function() {
  initToasts();
  initNav();
});

function initToasts() {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;

  window.showToast = function(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toastContainer.removeChild(toast), 200);
    }, 3000);
  };
}

function initNav() {
  const navLinks = document.querySelectorAll('.nav-link');
  const header = document.querySelector('.site-header');

  // Scroll shadow on header
  window.addEventListener('scroll', function() {
    if (window.scrollY > 100) {
      header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    } else {
      header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    }
  });

  // Smooth scroll for anchor links
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId.startsWith('#')) {
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}
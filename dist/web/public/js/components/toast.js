/* ==================== TOAST COMPONENT ==================== */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 200);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
  window.showToast = showToast;
});
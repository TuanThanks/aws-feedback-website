const form = document.getElementById('feedback-form');
const statusEl = document.getElementById('form-status');
const submitButton = document.getElementById('submit-button');
document.getElementById('year').textContent = new Date().getFullYear();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = 'Submitting...';

  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Submission failed.');
    statusEl.textContent = `${result.message} Reference: #${result.feedback_id}`;
    statusEl.classList.add('success');
    form.reset();
  } catch (error) {
    statusEl.textContent = error.message || 'Unable to submit feedback.';
    statusEl.classList.add('error');
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span:first-child').textContent = 'Submit feedback';
  }
});

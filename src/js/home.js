// ── Nav scroll shadow
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 30);
});

// ── Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

// ── FAQ accordion
document.querySelectorAll('.faq-item').forEach(item => {
  item.querySelector('.faq-question').addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── Scroll fade-in
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ── Contact form placeholder (API to be added later)
document.getElementById('submitBtn').addEventListener('click', () => {
  const fname = document.getElementById('fname').value.trim();
  const email = document.getElementById('email').value.trim();
  const type  = document.getElementById('enquiry-type').value;
  if (!fname || !email || !type) {
    alert('Please complete your name, email and enquiry type before submitting.');
    return;
  }
  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Message sent ✓';
  btn.style.background = 'var(--green-light)';
  btn.disabled = true;
  // TODO: replace with API call
});

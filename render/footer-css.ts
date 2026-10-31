export const FOOTER_CSS = `/* ===== Enhanced Footer ===== */
.footer {
  position: relative;
  margin-top: 4rem;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  overflow: hidden;
}

.footer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent) 30%,
    var(--purple) 70%,
    transparent 100%
  );
  opacity: 0.5;
}

.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 2rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 3rem 2rem 2rem;
}

.footer-col {
  min-width: 0;
}

.footer-logo {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 1rem;
  letter-spacing: 1px;
}

.footer-logo span {
  color: var(--accent);
}

.footer-logo-img {
  display: inline-block;
  vertical-align: middle;
  margin-right: 8px;
  border-radius: 4px;
}

.footer-about {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.7;
  margin-bottom: 1.25rem;
  max-width: 300px;
}

.footer-social {
  display: flex;
  gap: 10px;
  margin-bottom: 1rem;
}

.social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  text-decoration: none;
  transition: var(--trans);
}

.social-link:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--text-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.social-icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
  stroke: none;
}

.footer-heading {
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--accent);
  margin-bottom: 1rem;
  position: relative;
  padding-bottom: 0.5rem;
}

.footer-heading::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 30px;
  height: 2px;
  background: linear-gradient(to right, var(--accent), transparent);
  border-radius: 2px;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.6rem;
}

.footer-links a {
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-decoration: none;
  transition: var(--trans);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.footer-links a:hover {
  color: var(--text-primary);
  transform: translateX(4px);
}

.footer-bottom {
  border-top: 1px solid var(--border);
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.25rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.footer-bottom a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: var(--trans);
}

.footer-bottom a:hover {
  color: var(--accent);
}

.footer-dot {
  margin: 0 6px;
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 900px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
  .footer-col:first-child {
    grid-column: span 2;
  }
}

@media (max-width: 600px) {
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding: 2rem 1.25rem 1.5rem;
  }
  .footer-col:first-child {
    grid-column: span 1;
  }
  .footer-bottom {
    flex-direction: column;
    text-align: center;
  }
  .footer-about {
    max-width: 100%;
  }
}
</style>
`;

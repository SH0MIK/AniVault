export function privacyBody(siteUrl: string, lastUpdated: string): string {
  return `
<style>
.legal-hero {
  background: linear-gradient(135deg, rgba(124,58,237,0.08) 0%, transparent 60%);
  border-bottom: 1px solid var(--border);
  padding: 3rem 0 2.5rem;
  margin-bottom: 0;
}
.legal-hero-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 2rem;
}
.legal-eyebrow {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.legal-eyebrow::before {
  content: '';
  display: inline-block;
  width: 20px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
}
.legal-hero h1 {
  font-size: 2.4rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}
.legal-meta {
  color: var(--text-muted);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.legal-meta span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.legal-meta .dot {
  width: 4px;
  height: 4px;
  background: var(--text-muted);
  border-radius: 50%;
}

.legal-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 3rem;
  max-width: 1100px;
  margin: 0 auto;
  padding: 3rem 2rem 5rem;
  align-items: start;
}

/* Sticky TOC sidebar */
.legal-toc {
  position: sticky;
  top: 80px;
}
.legal-toc-title {
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.toc-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toc-list a {
  display: block;
  padding: 6px 10px;
  font-size: 0.82rem;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  transition: var(--trans);
  line-height: 1.4;
}
.toc-list a:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-left-color: var(--accent);
}
.toc-list a.active {
  color: var(--accent);
  background: rgba(124,58,237,0.08);
  border-left-color: var(--accent);
}

/* Main content */
.legal-content {
  min-width: 0;
}
.legal-section {
  margin-bottom: 3.5rem;
  scroll-margin-top: 90px;
}
.legal-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1.25rem;
}
.legal-section-num {
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--accent);
  background: rgba(124,58,237,0.1);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  letter-spacing: 1px;
  white-space: nowrap;
}
.legal-section h2 {
  font-size: 1.2rem;
  color: var(--text-primary);
  margin: 0;
}
.legal-section p,
.legal-section li {
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.8;
  margin-bottom: 0.75rem;
}
.legal-section ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 1rem;
}
.legal-section ul li {
  padding-left: 1.5rem;
  position: relative;
  margin-bottom: 0.4rem;
}
.legal-section ul li::before {
  content: '›';
  position: absolute;
  left: 4px;
  color: var(--accent);
  font-weight: 700;
}
.legal-highlight {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 1rem 1.25rem;
  margin: 1rem 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.legal-highlight strong {
  color: var(--text-primary);
}
.legal-divider {
  height: 1px;
  background: var(--border);
  margin: 3rem 0;
}
.legal-contact-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.legal-contact-card a {
  color: var(--accent);
  font-size: 0.9rem;
}
.legal-contact-card a:hover { color: #9d6ef8; }
.legal-contact-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 0.25rem;
}

@media (max-width: 768px) {
  .legal-layout {
    grid-template-columns: 1fr;
    padding: 2rem 1rem 4rem;
    gap: 2rem;
  }
  .legal-toc { position: static; }
  .legal-hero h1 { font-size: 1.75rem; }
}
</style>

<!-- Hero -->
<div class="legal-hero">
  <div class="legal-hero-inner">
    <div class="legal-eyebrow">AniVault Legal</div>
    <h1>Privacy Policy</h1>
    <div class="legal-meta">
      <span>Last updated: ${lastUpdated}</span>
      <span class="dot"></span>
      <span>Effective immediately</span>
      <span class="dot"></span>
      <span>~5 min read</span>
    </div>
  </div>
</div>

<div class="legal-layout">

  <!-- Sidebar TOC -->
  <aside class="legal-toc">
    <div class="legal-toc-title">Contents</div>
    <ul class="toc-list" id="toc-list">
      <li><a href="#overview">Overview</a></li>
      <li><a href="#data-collected">Data We Collect</a></li>
      <li><a href="#data-use">How We Use Data</a></li>
      <li><a href="#data-sharing">Data Sharing</a></li>
      <li><a href="#cookies">Cookies & Storage</a></li>
      <li><a href="#third-party">Third-Party Services</a></li>
      <li><a href="#your-rights">Your Rights</a></li>
      <li><a href="#data-retention">Data Retention</a></li>
      <li><a href="#security">Security</a></li>
      <li><a href="#children">Children's Privacy</a></li>
      <li><a href="#changes">Policy Changes</a></li>
      <li><a href="#contact">Contact Us</a></li>
    </ul>
  </aside>

  <!-- Main Content -->
  <article class="legal-content">

    <div class="legal-section" id="overview">
      <div class="legal-section-header">
        <span class="legal-section-num">01</span>
        <h2>Overview</h2>
      </div>
      <p>Welcome to AniVault. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our anime tracking services.</p>
      <div class="legal-highlight">
        <strong>The short version:</strong> We collect the minimum data necessary to provide you with a great anime tracking experience. We don't sell your personal information to third parties, ever.
      </div>
      <p>By using AniVault, you agree to the collection and use of information in accordance with this policy. If you do not agree with the terms of this policy, please do not access the site.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="data-collected">
      <div class="legal-section-header">
        <span class="legal-section-num">02</span>
        <h2>Data We Collect</h2>
      </div>
      <p>We collect several types of information in connection with the operation of AniVault:</p>
      <p><strong style="color:var(--text-primary)">Information you provide directly:</strong></p>
      <ul>
        <li>Username and email address during registration</li>
        <li>Password (stored as a cryptographic hash — never plaintext)</li>
        <li>Profile avatar and bio if you choose to set them</li>
        <li>Anime list entries, scores, episode progress, and reviews</li>
        <li>Comments, follows, and other social interactions</li>
      </ul>
      <p><strong style="color:var(--text-primary)">Information collected automatically:</strong></p>
      <ul>
        <li>Browser type and device information</li>
        <li>IP address and approximate geographic location</li>
        <li>Pages visited and features used within AniVault</li>
        <li>Timestamps of activity and session data</li>
      </ul>
      <p>We do not collect sensitive personal data such as financial information, government IDs, or health data.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="data-use">
      <div class="legal-section-header">
        <span class="legal-section-num">03</span>
        <h2>How We Use Data</h2>
      </div>
      <p>Your information is used exclusively to provide and improve the AniVault experience:</p>
      <ul>
        <li>Creating and managing your user account</li>
        <li>Storing and syncing your anime list and progress</li>
        <li>Powering your activity feed and social features</li>
        <li>Sending notifications about follows, comments, or announcements</li>
        <li>Detecting and preventing abuse, fraud, or violations of our Terms of Use</li>
        <li>Diagnosing technical issues and improving site performance</li>
        <li>Generating anonymized, aggregate statistics about site usage</li>
      </ul>
      <div class="legal-highlight">
        We will <strong>never</strong> use your data for targeted advertising, sell it to data brokers, or share it with marketers.
      </div>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="data-sharing">
      <div class="legal-section-header">
        <span class="legal-section-num">04</span>
        <h2>Data Sharing</h2>
      </div>
      <p>We do not sell, trade, or rent your personal information. We may share data only in the following limited circumstances:</p>
      <ul>
        <li><strong style="color:var(--text-primary)">Public profile data:</strong> Your username, avatar, and public anime list are visible to other users by default. You may adjust visibility in your profile settings.</li>
        <li><strong style="color:var(--text-primary)">Service providers:</strong> We may share limited data with trusted infrastructure providers (e.g., hosting, CDN) who are contractually bound to protect your information.</li>
        <li><strong style="color:var(--text-primary)">Legal compliance:</strong> We may disclose data when required by law, court order, or to protect the rights and safety of our users.</li>
        <li><strong style="color:var(--text-primary)">Business transfers:</strong> In the event of a merger or acquisition, your data may be transferred as part of that transaction, with prior notice provided to users.</li>
      </ul>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="cookies">
      <div class="legal-section-header">
        <span class="legal-section-num">05</span>
        <h2>Cookies &amp; Local Storage</h2>
      </div>
      <p>AniVault uses cookies and browser local storage strictly for functional purposes:</p>
      <ul>
        <li><strong style="color:var(--text-primary)">Session cookies:</strong> Required to keep you logged into your account. These expire when you close your browser or log out.</li>
        <li><strong style="color:var(--text-primary)">Preference storage:</strong> Local storage may save UI preferences such as theme or filter settings. This data never leaves your device.</li>
        <li><strong style="color:var(--text-primary)">API cache:</strong> Responses from the Jikan/MyAnimeList API may be temporarily cached server-side to reduce latency and rate limiting.</li>
      </ul>
      <p>We do not use tracking cookies, advertising cookies, or third-party analytics cookies.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="third-party">
      <div class="legal-section-header">
        <span class="legal-section-num">06</span>
        <h2>Third-Party Services</h2>
      </div>
      <p>AniVault is powered by third-party data sources and infrastructure. Your use of AniVault may involve interaction with:</p>
      <ul>
        <li><strong style="color:var(--text-primary)">Jikan API:</strong> All anime metadata is sourced from the unofficial Jikan REST API, which pulls public data from MyAnimeList. Queries are made server-side; your personal account data is never shared with Jikan.</li>
        <li><strong style="color:var(--text-primary)">MyAnimeList:</strong> AniVault is not affiliated with, endorsed by, or connected to MyAnimeList or its parent company.</li>
        <li><strong style="color:var(--text-primary)">Hosting providers:</strong> Our infrastructure providers may process request metadata (IP addresses, headers) as part of normal operation.</li>
      </ul>
      <p>We encourage you to review the privacy policies of these third parties independently.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="your-rights">
      <div class="legal-section-header">
        <span class="legal-section-num">07</span>
        <h2>Your Rights</h2>
      </div>
      <p>You have meaningful control over your data on AniVault:</p>
      <ul>
        <li><strong style="color:var(--text-primary)">Access:</strong> You may view all data associated with your account at any time from your profile and list pages.</li>
        <li><strong style="color:var(--text-primary)">Correction:</strong> You can edit your profile, list entries, and reviews directly from your account settings.</li>
        <li><strong style="color:var(--text-primary)">Export:</strong> You may export your full anime list in standard formats via the Import/Export page.</li>
        <li><strong style="color:var(--text-primary)">Deletion:</strong> You may request deletion of your account and associated data by contacting us. Deletion is permanent and irreversible.</li>
        <li><strong style="color:var(--text-primary)">Objection:</strong> You may object to any processing of your data that you believe is not necessary for the stated purposes.</li>
      </ul>
      <p>To exercise any of these rights, please contact us using the details in Section 12.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="data-retention">
      <div class="legal-section-header">
        <span class="legal-section-num">08</span>
        <h2>Data Retention</h2>
      </div>
      <p>We retain your personal data for as long as your account is active or as needed to provide you services. Specifically:</p>
      <ul>
        <li>Account and profile data is retained until account deletion is requested.</li>
        <li>Anime list entries, scores, and reviews are retained as part of your account history.</li>
        <li>Server logs containing IP addresses are rotated and deleted within 30 days.</li>
        <li>API cache data is purged within 24 hours.</li>
      </ul>
      <p>Upon account deletion, all personally identifiable information is removed within 30 days. Anonymized, aggregated statistical data may be retained indefinitely.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="security">
      <div class="legal-section-header">
        <span class="legal-section-num">09</span>
        <h2>Security</h2>
      </div>
      <p>We take the security of your data seriously and implement reasonable technical measures, including:</p>
      <ul>
        <li>Passwords hashed using bcrypt with appropriate cost factors</li>
        <li>HTTPS enforced across all pages</li>
        <li>CSRF protection on all state-changing requests</li>
        <li>Input validation and parameterized database queries to prevent injection attacks</li>
        <li>Regular dependency updates and security patches</li>
      </ul>
      <div class="legal-highlight">
        No method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security. In the event of a data breach that affects your personal information, we will notify you promptly.
      </div>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="children">
      <div class="legal-section-header">
        <span class="legal-section-num">10</span>
        <h2>Children's Privacy</h2>
      </div>
      <p>AniVault is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal data, please contact us and we will take steps to delete such information promptly.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="changes">
      <div class="legal-section-header">
        <span class="legal-section-num">11</span>
        <h2>Policy Changes</h2>
      </div>
      <p>We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at the top of this page and, for significant changes, post an announcement on the site.</p>
      <p>Your continued use of AniVault after any changes to this policy constitutes your acceptance of the updated terms. We encourage you to review this policy periodically.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="contact">
      <div class="legal-section-header">
        <span class="legal-section-num">12</span>
        <h2>Contact Us</h2>
      </div>
      <p>If you have any questions about this Privacy Policy, wish to exercise your data rights, or need to report a privacy concern, please reach out:</p>
      <div class="legal-contact-card">
        <div class="legal-contact-label">Email</div>
        <a href="mailto:abdullahalmahim585@gmail.com">abdullahalmahim585@gmail.com</a>
        <div class="legal-contact-label" style="margin-top:0.75rem">Response time</div>
        <span style="color:var(--text-secondary);font-size:0.9rem">We aim to respond within 1 business days.</span>
      </div>
      <p class="mt-2" style="font-size:0.85rem;color:var(--text-muted);">
        Also see: <a href="${siteUrl}/terms">Terms of Use</a>
      </p>
    </div>

  </article>
</div>

<script>
// Highlight active TOC item on scroll
const sections = document.querySelectorAll('.legal-section');
const tocLinks = document.querySelectorAll('#toc-list a');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      tocLinks.forEach(l => l.classList.remove('active'));
      const active = document.querySelector(\`#toc-list a[href="#\${entry.target.id}"]\`);
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });

sections.forEach(s => observer.observe(s));
</script>

`;
}

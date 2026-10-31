export function termsBody(siteUrl: string, lastUpdated: string): string {
  return `?>

<style>
.legal-hero {
  background: linear-gradient(135deg, rgba(162,155,254,0.07) 0%, transparent 60%);
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
  color: var(--purple);
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
  background: var(--purple);
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
  border-left-color: var(--purple);
}
.toc-list a.active {
  color: var(--purple);
  background: rgba(162,155,254,0.08);
  border-left-color: var(--purple);
}

.legal-content { min-width: 0; }

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
  color: var(--purple);
  background: rgba(162,155,254,0.1);
  border: 1px solid rgba(162,155,254,0.3);
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
  color: var(--purple);
  font-weight: 700;
}
.legal-highlight {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--purple);
  border-radius: var(--radius-sm);
  padding: 1rem 1.25rem;
  margin: 1rem 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.legal-highlight.warn {
  border-left-color: var(--gold);
}
.legal-highlight strong { color: var(--text-primary); }
.legal-divider {
  height: 1px;
  background: var(--border);
  margin: 3rem 0;
}

.conduct-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.conduct-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
}
.conduct-card-title {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 0.6rem;
}
.conduct-card.allowed .conduct-card-title { color: var(--teal); }
.conduct-card.forbidden .conduct-card-title { color: var(--accent); }
.conduct-card ul { margin: 0; }
.conduct-card ul li::before {
  color: inherit;
}
.conduct-card.allowed ul li::before { color: var(--teal); }
.conduct-card.forbidden ul li::before { color: var(--accent); }

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
.legal-contact-card a { color: var(--purple); font-size: 0.9rem; }
.legal-contact-card a:hover { color: #c8c3fe; }
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
  .conduct-grid { grid-template-columns: 1fr; }
}
</style>

<!-- Hero -->
<div class="legal-hero">
  <div class="legal-hero-inner">
    <div class="legal-eyebrow">AniVault Legal</div>
    <h1>Terms of Use</h1>
    <div class="legal-meta">
      <span>Last updated: ${lastUpdated}</span>
      <span class="dot"></span>
      <span>Effective immediately</span>
      <span class="dot"></span>
      <span>~6 min read</span>
    </div>
  </div>
</div>

<div class="legal-layout">

  <!-- Sidebar TOC -->
  <aside class="legal-toc">
    <div class="legal-toc-title">Contents</div>
    <ul class="toc-list" id="toc-list">
      <li><a href="#acceptance">Acceptance</a></li>
      <li><a href="#description">Service Description</a></li>
      <li><a href="#accounts">User Accounts</a></li>
      <li><a href="#conduct">Acceptable Use</a></li>
      <li><a href="#content">User Content</a></li>
      <li><a href="#intellectual-property">Intellectual Property</a></li>
      <li><a href="#third-party">Third-Party Services</a></li>
      <li><a href="#disclaimers">Disclaimers</a></li>
      <li><a href="#limitation">Limitation of Liability</a></li>
      <li><a href="#termination">Termination</a></li>
      <li><a href="#changes">Changes to Terms</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
  </aside>

  <!-- Main Content -->
  <article class="legal-content">

    <div class="legal-section" id="acceptance">
      <div class="legal-section-header">
        <span class="legal-section-num">01</span>
        <h2>Acceptance of Terms</h2>
      </div>
      <p>By accessing or using AniVault ("the Site," "the Service"), you agree to be bound by these Terms of Use. Please read them carefully before creating an account or using any features of the site.</p>
      <div class="legal-highlight">
        <strong>These terms form a legal agreement between you and AniVault.</strong> If you do not agree to these terms, you must not access or use the Service.
      </div>
      <p>These Terms apply to all visitors, registered users, and anyone else who accesses the Service. Use of AniVault also constitutes acceptance of our <a href="${siteUrl}/privacy">Privacy Policy</a>, which is incorporated herein by reference.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="description">
      <div class="legal-section-header">
        <span class="legal-section-num">02</span>
        <h2>Service Description</h2>
      </div>
      <p>AniVault is a free, community-driven anime tracking platform that allows users to:</p>
      <ul>
        <li>Maintain and organize personal anime watch lists</li>
        <li>Rate, review, and track episode progress for anime series</li>
        <li>Browse anime catalogs powered by the Jikan/MyAnimeList public API</li>
        <li>Discover seasonal and top-rated anime</li>
        <li>Connect with other users through follows, activity feeds, and community features</li>
      </ul>
      <p>AniVault is provided "as is" and we reserve the right to modify, suspend, or discontinue any aspect of the Service at any time without prior notice.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="accounts">
      <div class="legal-section-header">
        <span class="legal-section-num">03</span>
        <h2>User Accounts</h2>
      </div>
      <p>To access certain features, you must create an account. By registering, you agree to:</p>
      <ul>
        <li>Provide accurate, current, and complete information during registration</li>
        <li>Maintain and promptly update your account information as needed</li>
        <li>Keep your password confidential and not share it with others</li>
        <li>Accept responsibility for all activities that occur under your account</li>
        <li>Notify us immediately of any unauthorized use of your account</li>
      </ul>
      <p>You must be at least 13 years of age to create an account. Accounts created by automated means (bots) are strictly prohibited.</p>
      <div class="legal-highlight warn">
        <strong>One account per person.</strong> Creating multiple accounts to circumvent bans, exploit features, or impersonate others is a violation of these Terms and may result in permanent suspension of all associated accounts.
      </div>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="conduct">
      <div class="legal-section-header">
        <span class="legal-section-num">04</span>
        <h2>Acceptable Use</h2>
      </div>
      <p>We want AniVault to be a safe and enjoyable space for all anime fans. Your conduct on the platform must comply with the following guidelines:</p>

      <div class="conduct-grid">
        <div class="conduct-card allowed">
          <div class="conduct-card-title">✓ Allowed</div>
          <ul>
            <li>Sharing genuine opinions and reviews</li>
            <li>Constructive discussion and debate</li>
            <li>Reporting bugs and providing feedback</li>
            <li>Using the import/export features for personal use</li>
            <li>Following and interacting with other users respectfully</li>
          </ul>
        </div>
        <div class="conduct-card forbidden">
          <div class="conduct-card-title">✗ Prohibited</div>
          <ul>
            <li>Harassment, hate speech, or targeted abuse</li>
            <li>Spam, unsolicited promotion, or advertising</li>
            <li>Scraping, crawling, or automated data extraction</li>
            <li>Impersonating other users or public figures</li>
            <li>Posting spoilers without appropriate warnings</li>
            <li>Attempting to bypass rate limits or security measures</li>
          </ul>
        </div>
      </div>

      <p>Violations of these conduct standards may result in content removal, temporary suspension, or permanent account termination at our sole discretion.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="content">
      <div class="legal-section-header">
        <span class="legal-section-num">05</span>
        <h2>User Content</h2>
      </div>
      <p>By submitting content to AniVault (including reviews, ratings, comments, and profile information), you grant AniVault a non-exclusive, royalty-free, worldwide license to display and distribute that content within the Service.</p>
      <p>You retain ownership of your content and are solely responsible for it. You represent and warrant that:</p>
      <ul>
        <li>You own or have the rights to the content you submit</li>
        <li>Your content does not violate any applicable laws</li>
        <li>Your content does not infringe the intellectual property rights of any third party</li>
        <li>Your content does not contain malicious code, harmful links, or unauthorized advertising</li>
      </ul>
      <p>We reserve the right to remove any content that violates these Terms or that we determine, in our sole discretion, to be harmful to the community.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="intellectual-property">
      <div class="legal-section-header">
        <span class="legal-section-num">06</span>
        <h2>Intellectual Property</h2>
      </div>
      <p>The AniVault platform — including its design, code, branding, and original content — is the intellectual property of AniVault and is protected under applicable copyright and trademark laws.</p>
      <p>Anime titles, artwork, characters, and related metadata displayed on AniVault are the property of their respective creators, studios, and distributors. AniVault does not claim ownership of any third-party intellectual property.</p>
      <div class="legal-highlight">
        AniVault is <strong>not affiliated with, endorsed by, or sponsored by MyAnimeList</strong> or its parent company. Anime data is sourced from the public Jikan API and is used for informational and tracking purposes only.
      </div>
      <p>You may not copy, reproduce, distribute, or create derivative works from AniVault's original code or design without prior written permission.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="third-party">
      <div class="legal-section-header">
        <span class="legal-section-num">07</span>
        <h2>Third-Party Services</h2>
      </div>
      <p>AniVault relies on third-party services to operate. Your use of AniVault implicitly involves interaction with these services:</p>
      <ul>
        <li><strong style="color:var(--text-primary)">Jikan API:</strong> Provides anime metadata. Subject to its own terms of service and rate limits. Service availability may be affected by Jikan's operational status.</li>
        <li><strong style="color:var(--text-primary)">MyAnimeList:</strong> The source of underlying anime data. AniVault has no control over MyAnimeList's data availability or accuracy.</li>
      </ul>
      <p>AniVault is not responsible for the availability, accuracy, or actions of any third-party services. Links to external sites are provided for convenience only and do not constitute endorsement.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="disclaimers">
      <div class="legal-section-header">
        <span class="legal-section-num">08</span>
        <h2>Disclaimers</h2>
      </div>
      <p>AniVault is provided on an <strong style="color:var(--text-primary)">"AS IS" and "AS AVAILABLE"</strong> basis without warranties of any kind, either express or implied, including but not limited to:</p>
      <ul>
        <li>Warranties of merchantability or fitness for a particular purpose</li>
        <li>Guarantees of uninterrupted, error-free, or secure operation</li>
        <li>Warranties regarding the accuracy or completeness of anime metadata</li>
        <li>Guarantees that the Service will meet your specific requirements</li>
      </ul>
      <p>We do not warrant that defects will be corrected or that the platform is free of viruses or other harmful components. Your use of the Service is at your own risk.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="limitation">
      <div class="legal-section-header">
        <span class="legal-section-num">09</span>
        <h2>Limitation of Liability</h2>
      </div>
      <p>To the maximum extent permitted by applicable law, AniVault and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from:</p>
      <ul>
        <li>Your use of or inability to use the Service</li>
        <li>Unauthorized access to or alteration of your data</li>
        <li>Loss of anime list data due to technical failures</li>
        <li>Conduct of any third party on or through the Service</li>
        <li>Any other matter relating to the Service</li>
      </ul>
      <p>We strongly recommend using the Export feature to keep a personal backup of your anime list data.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="termination">
      <div class="legal-section-header">
        <span class="legal-section-num">10</span>
        <h2>Termination</h2>
      </div>
      <p>We reserve the right to suspend or terminate your account and access to AniVault at any time, with or without cause, including for violation of these Terms.</p>
      <p>You may delete your account at any time by contacting us. Upon termination:</p>
      <ul>
        <li>Your right to use the Service will immediately cease</li>
        <li>Your public profile and list will no longer be accessible</li>
        <li>Personal data will be deleted in accordance with our Privacy Policy</li>
        <li>Content you have contributed (reviews, ratings) may remain in anonymized form</li>
      </ul>
      <p>Provisions of these Terms that by their nature should survive termination (including IP rights, disclaimers, and limitations of liability) shall survive.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="changes">
      <div class="legal-section-header">
        <span class="legal-section-num">11</span>
        <h2>Changes to Terms</h2>
      </div>
      <p>We may revise these Terms of Use at any time. When we make material changes, we will update the "Last updated" date at the top of this page and, where appropriate, post an announcement on the platform.</p>
      <p>Your continued use of AniVault after any changes to the Terms constitutes your agreement to the revised terms. If you disagree with a change, your recourse is to stop using the Service and delete your account.</p>
    </div>

    <div class="legal-divider"></div>

    <div class="legal-section" id="contact">
      <div class="legal-section-header">
        <span class="legal-section-num">12</span>
        <h2>Contact</h2>
      </div>
      <p>If you have questions about these Terms, wish to report a violation, or need to dispute a moderation decision, please contact us:</p>
      <div class="legal-contact-card">
        <div class="legal-contact-label">Email</div>
        <a href="mailto:abdullahalmahim585@gmail.com">abdullahalmahim585@gmail.com</a>
        <div class="legal-contact-label" style="margin-top:0.75rem">Response time</div>
        <span style="color:var(--text-secondary);font-size:0.9rem">We aim to respond within 1 business days.</span>
      </div>
      <p class="mt-2" style="font-size:0.85rem;color:var(--text-muted);">
        Also see: <a href="${siteUrl}/privacy">Privacy Policy</a>
      </p>
    </div>

  </article>
</div>

<script>
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

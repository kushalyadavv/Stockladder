import { useEffect } from "react";
import { motion } from "framer-motion";
import "./landing.css";

const LAST_UPDATED = "June 6, 2026";
const CONTACT_EMAIL = "support@stockladder.xyz";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "StockLadder | Privacy Policy";
  }, []);

  return (
    <div className="landing landing--legal">
      <div className="landing__inner landing__inner--legal">
        <motion.header
          className="landing__header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <a href="/">
            <img
              className="landing__logo"
              src="/stockladder-hero.png"
              alt="StockLadder"
              width={48}
              height={48}
            />
          </a>
          <div>
            <h1 className="landing__brand">StockLadder</h1>
            <p className="landing__tagline">Privacy Policy</p>
          </div>
        </motion.header>

        <motion.article
          className="landing__legal"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="landing__legal-updated">Last updated: {LAST_UPDATED}</p>

          <section>
            <h2>Overview</h2>
            <p>
              StockLadder (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is
              operated by <strong>Pinion Labs Inc.</strong> This
              Privacy Policy explains how we collect, use, and protect
              information when merchants install and use the StockLadder Shopify
              app at <a href="https://stockladder.xyz">stockladder.xyz</a>.
            </p>
            <p>
              StockLadder sorts collection product order based on inventory,
              sales, and merchant-configured rules. We process store data only
              to provide that service.
            </p>
          </section>

          <section>
            <h2>Information we collect</h2>
            <h3>From Shopify (with your permission)</h3>
            <ul>
              <li>Store domain and app installation status</li>
              <li>Products, variants, inventory levels, and collection data</li>
              <li>Order line item aggregates for sales-based sorting (units and revenue, not customer names or addresses)</li>
              <li>OAuth access tokens required to call the Shopify Admin API on your behalf</li>
            </ul>
            <h3>Stored by StockLadder</h3>
            <ul>
              <li>Your sort settings and per-collection rule overrides</li>
              <li>Collection order snapshots before each sort (for preview and revert)</li>
              <li>Sort run logs and basic usage metrics (e.g. sorts run per month)</li>
              <li>Subscription plan status if you upgrade to a paid plan</li>
              <li>Optional GA4 CSV data you manually import (Pro plan only)</li>
            </ul>
            <h3>What we do not collect</h3>
            <ul>
              <li>Customer names, emails, phone numbers, or shipping addresses</li>
              <li>Payment card details (billing is handled entirely by Shopify)</li>
              <li>Browsing behavior of your store visitors</li>
            </ul>
          </section>

          <section>
            <h2>How we use information</h2>
            <ul>
              <li>Reorder products in collections according to your settings</li>
              <li>Show previews, dry runs, run history, and analytics in the app dashboard</li>
              <li>Trigger automatic re-sorts when inventory changes (Growth and Pro plans)</li>
              <li>Enforce plan limits and process subscription upgrades through Shopify Billing</li>
              <li>Maintain security, troubleshoot errors, and improve reliability</li>
            </ul>
            <p>We do not sell, rent, or trade merchant data to third parties.</p>
          </section>

          <section>
            <h2>Where data is stored</h2>
            <p>
              App data is stored on secure servers operated by StockLadder
              (currently hosted on Oracle Cloud Infrastructure). Data is scoped
              per Shopify store and is not shared across merchants.
            </p>
            <p>
              Shopify also processes data according to the{" "}
              <a
                href="https://www.shopify.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Shopify Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2>Data retention and deletion</h2>
            <ul>
              <li>
                When you uninstall StockLadder, we revoke API access and mark
                your store as uninstalled.
              </li>
              <li>
                Shop configuration, snapshots, and tokens are removed or
                anonymized within 30 days of uninstall, unless law requires
                longer retention.
              </li>
              <li>
                You may request earlier deletion by emailing{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </li>
            </ul>
          </section>

          <section>
            <h2>Security</h2>
            <p>
              We use HTTPS for all app traffic, secure OAuth token storage,
              webhook HMAC verification, and access controls so each store can
              only access its own data. No method of transmission over the
              internet is 100% secure, but we take reasonable steps to protect
              your information.
            </p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct,
              or delete personal data we hold about you as a merchant or app
              user. Contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we
              will respond within a reasonable time.
            </p>
          </section>

          <section>
            <h2>Children</h2>
            <p>
              StockLadder is a business tool for Shopify merchants. We do not
              knowingly collect information from children.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              We may update this policy from time to time. The &quot;Last
              updated&quot; date at the top will change when we do. Continued use
              of the app after changes means you accept the revised policy.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              <strong>Pinion Labs Inc.</strong>
              <br />
              Email:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <br />
              Website:{" "}
              <a href="https://stockladder.xyz">https://stockladder.xyz</a>
            </p>
          </section>
        </motion.article>

        <footer className="landing__footer">
          <a href="/" className="landing__footer-link">
            ← Back to StockLadder
          </a>
          <br />
          © {new Date().getFullYear()} StockLadder · Pinion Labs Inc.
        </footer>
      </div>
    </div>
  );
}

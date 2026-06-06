import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import "./landing.css";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.07 } },
};

const FEATURES = [
  {
    title: "Inventory-first sorting",
    body: "In-stock products rise to the top. Out-of-stock items sink automatically so shoppers never land on dead ends.",
    icon: "📦",
  },
  {
    title: "Sales-aware ranking",
    body: "Blend best sellers and revenue with stock levels. Rank by units sold or revenue over the last 7, 30, or 60 days.",
    icon: "📈",
  },
  {
    title: "Safe snapshots",
    body: "Every sort saves a snapshot. Preview changes, dry-run before going live, and revert to the previous order in one click.",
    icon: "🔄",
  },
  {
    title: "Per-collection rules",
    body: "Set global defaults, then override specific collections. Skip seasonal sales, pin featured tags, or push vendors up or down.",
    icon: "🎯",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Install & connect",
    body: "Add StockLadder from the Shopify App Store or enter your store domain above. OAuth connects in seconds.",
  },
  {
    step: "2",
    title: "Configure your rules",
    body: "Pick a sort strategy, choose collections, set OOS behavior, and optionally layer sales or tag-based rules.",
  },
  {
    step: "3",
    title: "Run or automate",
    body: "Dry-run to preview, then sort live. On Growth and Pro, inventory webhooks re-sort automatically after stock changes.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "Forever",
    perks: ["10 collections", "Inventory & OOS sort", "Collection analytics", "Hourly manual runs"],
  },
  {
    name: "Growth",
    price: "$9",
    note: "/ month",
    highlight: true,
    perks: ["50 collections", "Sales-based sort", "Inventory webhooks", "Rule stack & tag rules"],
  },
  {
    name: "Pro",
    price: "$19",
    note: "/ month",
    perks: ["100 collections", "A/B strategy compare", "Seasonal sync", "GA4 import"],
  },
];

const FAQ = [
  {
    q: "Will this change my product data?",
    a: "No. StockLadder only reorders products inside manual collections. Titles, prices, images, and inventory quantities stay untouched.",
  },
  {
    q: "Can I undo a sort?",
    a: "Yes. Every run creates a snapshot. Use Revert snapshot in the app to restore the previous collection order.",
  },
  {
    q: "Does it work with automated collections?",
    a: "StockLadder sorts manual collections. For smart collections, Pro includes mirror sync to keep a manual copy in sync.",
  },
  {
    q: "What happens when a product goes out of stock?",
    a: "Depending on your settings, OOS products move to the bottom or are hidden from the collection view entirely.",
  },
];

const PILLS = [
  "Auto sort",
  "OOS to bottom",
  "Sales ranking",
  "Per-collection rules",
  "Revert anytime",
  "Dry run preview",
];

const STATS = [
  { value: "60s", label: "Average setup time" },
  { value: "3", label: "Flexible plan tiers" },
  { value: "100%", label: "Reversible sorts" },
];

function normalizeShopInput(shop) {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return { domain: "", error: "Enter your store domain" };
  const domain = trimmed.includes(".myshopify.com")
    ? trimmed
    : `${trimmed}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    return { domain: "", error: "Use your-store.myshopify.com format" };
  }
  return { domain, error: "" };
}

function InstallCard({ shop, setShop, error, onInstall }) {
  return (
    <motion.div
      className="landing__card"
      initial={{ opacity: 0, y: 32, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, boxShadow: "0 28px 60px rgba(0,0,0,0.28)" }}
    >
      <h2>Install on your store</h2>
      <p>
        Enter your Shopify store domain to connect StockLadder, or open the app
        from <strong>Shopify Admin → Apps</strong> if already listed.
      </p>
      <div className="landing__field">
        <label htmlFor="shop-domain">Store domain</label>
        <input
          id="shop-domain"
          type="text"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-store.myshopify.com"
          autoComplete="off"
          onKeyDown={(e) => e.key === "Enter" && onInstall()}
        />
        {error ? <p className="landing__error">{error}</p> : null}
      </div>
      <motion.button
        type="button"
        className="landing__btn"
        onClick={onInstall}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Install app
      </motion.button>
      <p className="landing__hint">
        Free plan available. Works with dev stores now; live stores after App
        Store approval.
      </p>
    </motion.div>
  );
}

export default function InstallGate({ shop: initialShop = "", embedded = false }) {
  const [shop, setShop] = useState(initialShop);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = embedded
      ? "StockLadder | Connect your store"
      : "StockLadder | Smart Collection Sorting for Shopify";
  }, [embedded]);

  const startInstall = () => {
    const { domain, error: validationError } = normalizeShopInput(shop);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    window.location.href = `/auth?shop=${encodeURIComponent(domain)}`;
  };

  if (embedded) {
    return (
      <Page title="Stockladder">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Install Stockladder
            </Text>
            <Banner tone="info">
              Complete OAuth authorization to connect this store.
            </Banner>
            <TextField
              label="Store domain"
              value={shop}
              onChange={setShop}
              placeholder="your-store.myshopify.com"
              autoComplete="off"
              error={error}
            />
            <Button variant="primary" onClick={startInstall}>
              Install app
            </Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return (
    <div className="landing">
      <div className="landing__glow landing__glow--1" aria-hidden />
      <div className="landing__glow landing__glow--2" aria-hidden />

      <div className="landing__inner">
        <motion.header
          className="landing__header"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <motion.img
            className="landing__logo"
            src="/favicon.png"
            alt="StockLadder"
            width={56}
            height={56}
            whileHover={{ rotate: [-2, 2, 0], scale: 1.05 }}
            transition={{ duration: 0.4 }}
          />
          <div>
            <h1 className="landing__brand">StockLadder</h1>
            <p className="landing__tagline">
              Smart collection sorting for Shopify
            </p>
          </div>
        </motion.header>

        <section className="landing__hero">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.h2 className="landing__headline" variants={fadeUp}>
              Put your <em>best products first</em>, automatically
            </motion.h2>
            <motion.p className="landing__sub" variants={fadeUp}>
              StockLadder keeps collection pages fresh by sorting products based
              on inventory, sales velocity, and rules you control. Stop dragging
              products by hand. Let in-stock winners surface while sold-out SKUs
              fade to the bottom.
            </motion.p>
            <motion.div className="landing__stats" variants={fadeUp}>
              {STATS.map((stat) => (
                <div key={stat.label} className="landing__stat">
                  <span className="landing__stat-value">{stat.value}</span>
                  <span className="landing__stat-label">{stat.label}</span>
                </div>
              ))}
            </motion.div>
            <motion.div className="landing__features" variants={stagger}>
              {PILLS.map((pill, i) => (
                <motion.span
                  key={pill}
                  className="landing__pill"
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ scale: 1.06, backgroundColor: "rgba(94,234,212,0.2)" }}
                >
                  {pill}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>

          <InstallCard
            shop={shop}
            setShop={setShop}
            error={error}
            onInstall={startInstall}
          />
        </section>

        <motion.section
          className="landing__section"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
        >
          <motion.h2 className="landing__section-title" variants={fadeUp}>
            Why merchants choose StockLadder
          </motion.h2>
          <motion.p className="landing__section-sub" variants={fadeUp}>
            Built for catalog-heavy stores where collection order directly
            impacts conversion. Fashion, beauty, supplements, and multi-SKU
            brands see the biggest lift.
          </motion.p>
          <div className="landing__grid">
            {FEATURES.map((feature, i) => (
              <motion.article
                key={feature.title}
                className="landing__tile"
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -6, borderColor: "rgba(94,234,212,0.35)" }}
              >
                <span className="landing__tile-icon" aria-hidden>
                  {feature.icon}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="landing__section landing__section--alt"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
        >
          <motion.h2 className="landing__section-title" variants={fadeUp}>
            How it works
          </motion.h2>
          <div className="landing__steps">
            {STEPS.map((item, i) => (
              <motion.div
                key={item.step}
                className="landing__step"
                variants={fadeUp}
                custom={i}
              >
                <span className="landing__step-num">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="landing__section"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
        >
          <motion.h2 className="landing__section-title" variants={fadeUp}>
            Simple, transparent pricing
          </motion.h2>
          <motion.p className="landing__section-sub" variants={fadeUp}>
            Start free. Upgrade when you need sales sort, webhooks, or advanced
            merchandising tools. All paid plans include a 7-day trial.
          </motion.p>
          <div className="landing__plans">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                className={`landing__plan${plan.highlight ? " landing__plan--highlight" : ""}`}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -8 }}
              >
                {plan.highlight ? (
                  <span className="landing__plan-badge">Most popular</span>
                ) : null}
                <h3>{plan.name}</h3>
                <p className="landing__plan-price">
                  {plan.price}
                  <span>{plan.note}</span>
                </p>
                <ul>
                  {plan.perks.map((perk) => (
                    <li key={perk}>{perk}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="landing__section landing__section--alt"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
        >
          <motion.h2 className="landing__section-title" variants={fadeUp}>
            Frequently asked questions
          </motion.h2>
          <div className="landing__faq">
            {FAQ.map((item, i) => (
              <motion.details
                key={item.q}
                className="landing__faq-item"
                variants={fadeUp}
                custom={i}
              >
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </motion.details>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="landing__cta"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
        >
          <h2>Ready to climb the ladder?</h2>
          <p>
            Join merchants who keep their storefronts sorted, stocked, and
            conversion-ready without manual collection edits.
          </p>
          <motion.button
            type="button"
            className="landing__btn landing__btn--inline"
            onClick={() =>
              document
                .getElementById("shop-domain")
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            Get started free
          </motion.button>
        </motion.section>

        <footer className="landing__footer">
          © {new Date().getFullYear()} StockLadder · Looqus Media Private Limited
        </footer>
      </div>
    </div>
  );
}

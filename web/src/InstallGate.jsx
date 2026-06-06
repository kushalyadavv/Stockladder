import { useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

export default function InstallGate({ shop: initialShop = "", embedded = false }) {
  const [shop, setShop] = useState(initialShop);
  const [error, setError] = useState("");

  const startInstall = () => {
    const trimmed = shop.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter your store domain");
      return;
    }
    const domain = trimmed.includes(".myshopify.com")
      ? trimmed
      : `${trimmed}.myshopify.com`;
    window.location.href = `/auth?shop=${encodeURIComponent(domain)}`;
  };

  return (
    <Page title="Stockladder">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Install Stockladder
          </Text>
          {embedded ? (
            <Banner tone="info">
              Complete OAuth authorization to connect this store.
            </Banner>
          ) : (
            <Text as="p" tone="subdued">
              Enter your Shopify store to install the app, or open from Shopify
              Admin → Apps.
            </Text>
          )}
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

import { TitleBar } from "@shopify/app-bridge-react";

export default function EmbeddedShell({ children }) {
  return (
    <>
      <TitleBar title="Stockladder" />
      {children}
    </>
  );
}

import { Metadata, Viewport } from "next";

export const siteUrl = "https://factura.uno";
const siteName = "Factura";
const title = "Factura — your bill ledger";
const description =
  "Upload PDF bills, parse charges and meter data, and track household spending, utilities, and consumption over time. Factura is your bill ledger for electricity, gas, water, and home expenses.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s — Factura",
  },
  description,
  applicationName: siteName,
  authors: [{ name: "Factura" }],
  creator: "Factura",
  publisher: "Factura",
  category: "finance",
  keywords: [
    "bill ledger",
    "bill tracker",
    "utility bill tracker",
    "PDF bill parser",
    "household expense tracker",
    "electricity usage tracker",
    "water consumption tracker",
    "gas bill tracking",
    "home utilities dashboard",
    "recurring bill history",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title,
    description,
    locale: "en_US",
    // og:image tags are generated from src/app/opengraph-image.png
    // (file-based metadata, with alt from opengraph-image.alt.txt).
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // favicon.ico, icon.png and apple-icon.png are picked up automatically from
  // src/app/ as file-based metadata — no manual icons config needed.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "default",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#1f1a17",
};

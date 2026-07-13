import { BrandIcon, type BrandIconName } from "./BrandIcon";
import { MaterialIcon, type MaterialIconName } from "./MaterialIcon";
import type { LinkType } from "@/lib/labels";

// One place mapping each park-link type to its icon. Brand marks come from
// BrandIcon (Simple Icons); generic ones (globe/heart/link) from MaterialIcon.
// Support types with no brand mark (donate, givebutter) fall back to the heart.
const BRAND: Partial<Record<LinkType, BrandIconName>> = {
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  tiktok: "tiktok",
  twitter: "x",
  gofundme: "gofundme",
  venmo: "venmo",
  patreon: "patreon",
  paypal: "paypal",
};

const MATERIAL: Record<string, MaterialIconName> = {
  website: "public",
  donate: "favorite",
  givebutter: "favorite",
  other: "link",
};

export function LinkIcon({ type, className }: { type: LinkType; className?: string }) {
  const brand = BRAND[type];
  if (brand) return <BrandIcon name={brand} className={className} />;
  // Every non-brand type is covered by MATERIAL; fall back to the chain link
  // if a new LinkType is ever added without a mapping.
  return <MaterialIcon name={MATERIAL[type] ?? "link"} className={className} />;
}

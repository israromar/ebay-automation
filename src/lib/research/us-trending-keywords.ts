export type TrendNiche = "Wellness/Sleep" | "Beauty/Hair" | "Home Organization" | "Kitchen" | "Pet" | "Lighting/Smart Home" | "Phone/Travel" | "Fitness/Recovery";

export type TrendMomentum = "rising" | "steady" | "seasonal";

export interface TrendKeywordEntry {
  rank: number;
  keyword: string;
  niche: TrendNiche;
  momentum: TrendMomentum;
  sources: string[];
  why: string;
}

export interface UsTrendingKeywordCatalog {
  market: "US";
  version: string;
  researchedAt: string;
  sources: string[];
  keywords: TrendKeywordEntry[];
}

/**
 * Curated US Top 50 seed keywords (Jul 2026 research pass).
 * Generic product queries only — ranked by multi-source strength across
 * Google Trends, Amazon/TikTok translation, and eBay-friendly gadget niches.
 * Refresh Trends upserts this snapshot into the DB; it does not scrape live APIs.
 */
export const US_TRENDING_KEYWORD_CATALOG: UsTrendingKeywordCatalog = {
  market: "US",
  version: "2026.07.29",
  researchedAt: "2026-07-29T00:00:00.000Z",
  sources: ["Google Trends US rising product queries (2026)", "Amazon / TikTok Shop US viral wellness & home translation (2026)", "eBay high-volume Home / Electronics accessory categories (ZIK Jul 2026)", "Internal AE-sourcable gadget filter (generic queries, no branded SKUs)"],
  keywords: [
    { rank: 1, keyword: "mouth tape", niche: "Wellness/Sleep", momentum: "rising", sources: ["Google Trends"], why: "Fast YoY sleep-wellness search growth; compact AE-friendly SKU." },
    { rank: 2, keyword: "sleep earbuds", niche: "Wellness/Sleep", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Niche wireless audio for sleep; sustained search lift." },
    { rank: 3, keyword: "sauna blanket", niche: "Wellness/Sleep", momentum: "rising", sources: ["Google Trends", "TikTok"], why: "At-home infrared wellness with strong social proof." },
    { rank: 4, keyword: "hard water shower filter", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Beauty-prevention accessory with durable search interest." },
    { rank: 5, keyword: "magnetic spice rack", niche: "Home Organization", momentum: "steady", sources: ["Amazon", "eBay"], why: "Fridge organization staple with strong active-listing demand." },
    { rank: 6, keyword: "portable blender", niche: "Kitchen", momentum: "steady", sources: ["Amazon", "eBay", "TikTok"], why: "Evergreen travel kitchen gadget with proven AE match path." },
    { rank: 7, keyword: "led strip lights", niche: "Lighting/Smart Home", momentum: "steady", sources: ["eBay", "Amazon"], why: "High-volume lighting category with many AE variants." },
    { rank: 8, keyword: "pet water fountain", niche: "Pet", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Pet enrichment essential with recurring repurchase patterns." },
    { rank: 9, keyword: "flat back earrings", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends"], why: "Comfort piercing trend with clear product query language." },
    { rank: 10, keyword: "glass straw", niche: "Kitchen", momentum: "rising", sources: ["Google Trends"], why: "Sustainable kitchen accessory outpacing metal straw interest." },
    { rank: 11, keyword: "electric pepper grinder", niche: "Kitchen", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Ergonomic kitchen upgrade with gift-season spikes." },
    { rank: 12, keyword: "blue light therapy lamp", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends"], why: "Emerging beauty therapy niche less saturated than red light." },
    { rank: 13, keyword: "hair texture powder", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends"], why: "Volume/texture styling with strong male+female demand." },
    { rank: 14, keyword: "travel vanity bag", niche: "Phone/Travel", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Travel organization tied to multi-step skincare routines." },
    { rank: 15, keyword: "cable organizer travel", niche: "Phone/Travel", momentum: "steady", sources: ["Amazon", "eBay"], why: "Compact travel accessory with broad AE assortment." },
    { rank: 16, keyword: "wireless charging desk lamp", niche: "Lighting/Smart Home", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Combo desk utility + charging; strong desk-setup trend." },
    { rank: 17, keyword: "motion sensor night light", niche: "Lighting/Smart Home", momentum: "steady", sources: ["Amazon", "eBay"], why: "Evergreen home safety lighting with easy AE sourcing." },
    { rank: 18, keyword: "automatic pet feeder", niche: "Pet", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Pet automation staple; pairs with fountain research." },
    { rank: 19, keyword: "portable phone charger", niche: "Phone/Travel", momentum: "steady", sources: ["eBay", "Amazon"], why: "High-velocity electronics accessory for travel/commute." },
    { rank: 20, keyword: "sleep bonnet", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends"], why: "Hair-protection sleep accessory with sharp search growth." },
    { rank: 21, keyword: "hair repair mask", niche: "Beauty/Hair", momentum: "rising", sources: ["Google Trends", "TikTok"], why: "Targeted haircare treatment with social commerce lift." },
    { rank: 22, keyword: "hydrogen water bottle", niche: "Wellness/Sleep", momentum: "rising", sources: ["Google Trends", "TikTok"], why: "Wellness gadget with viral health positioning." },
    { rank: 23, keyword: "red light therapy mask", niche: "Beauty/Hair", momentum: "steady", sources: ["Amazon", "TikTok"], why: "At-home beauty device category with AE OEM depth." },
    { rank: 24, keyword: "magnetic phone mount", niche: "Phone/Travel", momentum: "steady", sources: ["Amazon", "eBay"], why: "Car/desk mount staple; strong AE catalog coverage." },
    { rank: 25, keyword: "usb desk lamp", niche: "Lighting/Smart Home", momentum: "steady", sources: ["eBay", "Amazon"], why: "Compact lighting for WFH desks; easy price banding." },
    { rank: 26, keyword: "rgb gaming lights", niche: "Lighting/Smart Home", momentum: "seasonal", sources: ["Amazon", "TikTok"], why: "Gaming aesthetic lighting with gift/season spikes." },
    { rank: 27, keyword: "air fryer accessories", niche: "Kitchen", momentum: "steady", sources: ["Amazon", "eBay"], why: "Accessory attach to large installed air-fryer base." },
    { rank: 28, keyword: "electric milk frother", niche: "Kitchen", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Coffee-at-home gadget with compact shipping profile." },
    { rank: 29, keyword: "silicone cooking utensils", niche: "Kitchen", momentum: "steady", sources: ["Amazon", "eBay"], why: "Kitchen staple sets; high AE assortment density." },
    { rank: 30, keyword: "lint remover roller", niche: "Home Organization", momentum: "steady", sources: ["Amazon", "eBay"], why: "Low-cost home care accessory with repeat use." },
    { rank: 31, keyword: "door draft stopper", niche: "Home Organization", momentum: "seasonal", sources: ["Amazon", "eBay"], why: "Energy-saving home accessory; winter demand spikes." },
    { rank: 32, keyword: "under sink organizer", niche: "Home Organization", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Home organization aesthetic still translating from social." },
    { rank: 33, keyword: "fridge organizer bins", niche: "Home Organization", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Kitchen storage trend adjacent to spice-rack demand." },
    { rank: 34, keyword: "pet hair remover", niche: "Pet", momentum: "steady", sources: ["Amazon", "eBay"], why: "Pet-household cleaning accessory with broad appeal." },
    { rank: 35, keyword: "dog puzzle toy", niche: "Pet", momentum: "rising", sources: ["Amazon", "TikTok"], why: "Pet enrichment toys rising with indoor pet lifestyle." },
    { rank: 36, keyword: "cat scratching pad", niche: "Pet", momentum: "steady", sources: ["Amazon", "eBay"], why: "Consumable-adjacent pet accessory with replace cycles." },
    { rank: 37, keyword: "posture corrector", niche: "Fitness/Recovery", momentum: "steady", sources: ["Amazon", "TikTok"], why: "WFH recovery accessory with continuous social demos." },
    { rank: 38, keyword: "resistance bands set", niche: "Fitness/Recovery", momentum: "steady", sources: ["Amazon", "eBay"], why: "Home fitness staple; dense AE supplier options." },
    { rank: 39, keyword: "massage gun mini", niche: "Fitness/Recovery", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Portable recovery tool still popular in fitness niches." },
    { rank: 40, keyword: "foam roller", niche: "Fitness/Recovery", momentum: "steady", sources: ["Amazon", "eBay"], why: "Evergreen recovery gear with clear Browse keywords." },
    { rank: 41, keyword: "neck stretcher", niche: "Fitness/Recovery", momentum: "rising", sources: ["Amazon", "TikTok"], why: "Cervical relief gadget with viral demo formats." },
    { rank: 42, keyword: "car phone holder dashboard", niche: "Phone/Travel", momentum: "steady", sources: ["eBay", "Amazon"], why: "Automotive phone accessory with high eBay sell-through." },
    { rank: 43, keyword: "laptop stand portable", niche: "Phone/Travel", momentum: "steady", sources: ["Amazon", "eBay"], why: "WFH / travel desk accessory with AE aluminum variants." },
    { rank: 44, keyword: "bluetooth tracker keychain", niche: "Phone/Travel", momentum: "rising", sources: ["Amazon", "TikTok"], why: "Find-my-item accessories remain a travel staple." },
    { rank: 45, keyword: "smart plug wifi", niche: "Lighting/Smart Home", momentum: "steady", sources: ["Amazon", "eBay"], why: "Entry smart-home device with recurring accessory demand." },
    { rank: 46, keyword: "solar garden lights", niche: "Lighting/Smart Home", momentum: "seasonal", sources: ["Amazon", "eBay"], why: "Outdoor lighting with spring/summer seasonal peaks." },
    { rank: 47, keyword: "continuous oil spray bottle", niche: "Kitchen", momentum: "rising", sources: ["Google Trends", "Amazon"], why: "Ergonomic kitchen spray bottle adjacent to grinder trend." },
    { rank: 48, keyword: "ice cube tray silicone", niche: "Kitchen", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Kitchen consumable-adjacent gadget with viral shapes." },
    { rank: 49, keyword: "makeup brush cleaner", niche: "Beauty/Hair", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Beauty hygiene tool with demo-friendly social content." },
    { rank: 50, keyword: "jade roller face", niche: "Beauty/Hair", momentum: "steady", sources: ["Amazon", "TikTok"], why: "Accessible skincare tool still active in beauty commerce." },
  ],
};

export function listCatalogNiches(): TrendNiche[] {
  return [...new Set(US_TRENDING_KEYWORD_CATALOG.keywords.map((entry) => entry.niche))];
}

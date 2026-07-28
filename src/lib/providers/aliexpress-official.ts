import type {
  AliExpressProduct,
  AliExpressProductDetails,
  ProductSearchInput,
} from "@/lib/domain/types";
import type { AliExpressProvider } from "./types";

/**
 * Official Affiliate API adapter.
 * Requires ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID.
 * Without credentials, throws — use AliExpressManualImportProvider for PoC.
 */
export class AliExpressOfficialApiProvider implements AliExpressProvider {
  readonly name = "AliExpressOfficialApiProvider";

  constructor(
    private readonly config: {
      appKey: string;
      appSecret: string;
      trackingId?: string;
      gatewayUrl?: string;
    },
  ) {}

  async searchProducts(input: ProductSearchInput): Promise<AliExpressProduct[]> {
    if (!this.config.appKey || !this.config.appSecret) {
      throw new Error("AliExpressOfficialApiProvider: missing credentials");
    }
    // Live signed REST call would go here after Open Platform approval.
    // Documented method: aliexpress.affiliate.product.query
    void input;
    throw new Error(
      "AliExpressOfficialApiProvider: live API not configured — set credentials and implement signed request after approval",
    );
  }

  async getProductDetails(urlOrId: string): Promise<AliExpressProductDetails> {
    void urlOrId;
    throw new Error(
      "AliExpressOfficialApiProvider: live API not configured — set credentials and implement signed request after approval",
    );
  }
}

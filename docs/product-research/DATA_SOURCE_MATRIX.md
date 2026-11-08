# Data source matrix

| Source | Supported use | Limitation |
|---|---|---|
| eBay Browse API | Active listings, price, seller/listing attributes, compatibility | Active inventory and lifetime quantity are not seller-level rolling 30-day proof. |
| Companion purchase history | Exact recent purchase rows for a listing using the operator's session | Must remain paced and stop on authentication or bot checks; availability can change. |
| Terapeak user import | User-authorized sold research evidence | Import provenance and seller identity must be retained. |
| AliExpress Affiliate API | Product discovery, price, order volume and API-specific reputation fields | Shipping and store-level rating may be absent; positive feedback is not automatically a five-star rating. |

Unavailable data must be reported as unknown or unverified. The app must not silently substitute generated values.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { minorToDollarsInput } from "@/lib/domain/ebay-sold-history";
import { fetchEbayPurchaseHistory } from "@/lib/providers/ebay-purchase-history";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { AliExpressManualImportProvider, sampleAliExpressCatalog } from "@/lib/providers/aliexpress-manual";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  apply: z.boolean().optional(),
  windowDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const candidate = await prisma.productCandidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const itemIdOrUrl = String(candidate.ebayItemId ?? candidate.ebayUrl ?? "");
  const result = await fetchEbayPurchaseHistory({
    itemIdOrUrl,
    windowDays: parsed.data.windowDays ?? 30,
  });

  const form = {
    soldLast30Days: result.soldLast30Days,
    avgCompletedSaleMinor: result.avgCompletedSaleMinor,
    medianCompletedSaleMinor: result.medianCompletedSaleMinor,
    avgCompletedSaleDollars: minorToDollarsInput(result.avgCompletedSaleMinor),
    medianCompletedSaleDollars: minorToDollarsInput(result.medianCompletedSaleMinor),
    evidenceUrl: result.evidenceUrl,
  };

  if (!result.available) {
    return NextResponse.json(
      {
        available: false,
        reason: result.reason,
        source: result.source,
        warnings: result.warnings,
        purchaseCount: result.purchases.length,
        form,
        history: result,
      },
      { status: result.reason === "login_required" ? 401 : 422 },
    );
  }

  let candidateUpdated = null;
  if (parsed.data.apply) {
    const orchestrator = new ScanOrchestrator({
      aliexpress: new AliExpressManualImportProvider(sampleAliExpressCatalog()),
      ebay: new EbayBrowseApiProvider({
        clientId: process.env.EBAY_CLIENT_ID ?? "",
        clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
      }),
    });
    try {
      candidateUpdated = await orchestrator.applyManualDemand(id, {
        soldLast30Days: result.soldLast30Days,
        avgCompletedSaleMinor: result.avgCompletedSaleMinor ?? undefined,
        medianCompletedSaleMinor: result.medianCompletedSaleMinor ?? undefined,
        evidenceUrl: result.evidenceUrl ?? undefined,
        verifiedBy: "purchase-history-fetch",
        notes: `Fetched via ${result.source}; ${result.purchases.length} row(s) parsed`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to apply demand";
      const status = message.includes("no validated AliExpress source") ? 409 : 500;
      return NextResponse.json(
        {
          available: true,
          applied: false,
          error: message,
          source: result.source,
          warnings: result.warnings,
          form,
          history: result,
        },
        { status },
      );
    }
  }

  return NextResponse.json({
    available: true,
    applied: Boolean(candidateUpdated),
    source: result.source,
    warnings: result.warnings,
    purchaseCount: result.purchases.length,
    form,
    history: {
      itemId: result.itemId,
      evidenceUrl: result.evidenceUrl,
      soldLast30Days: result.soldLast30Days,
      avgCompletedSaleMinor: result.avgCompletedSaleMinor,
      medianCompletedSaleMinor: result.medianCompletedSaleMinor,
      windowDays: result.windowDays,
      purchases: result.purchases.map((p) => ({
        buyerMasked: p.buyerMasked,
        priceMinor: p.priceMinor,
        quantity: p.quantity,
        purchasedAt: p.purchasedAt.toISOString(),
        rawDate: p.rawDate,
      })),
    },
    candidate: candidateUpdated,
  });
}

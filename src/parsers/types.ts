export type Consumption = { value: number; unit: "kWh" | "m3" };

export type ParsedBillFields = {
  /** Stable key identifying the vendor relationship. Real client number for
   * utilities; constructed `consorcioCUIT:unit` for expensas (they print none). */
  accountNumber: string;
  /** Normalized to first of month, YYYY-MM-01, by each vendor's own rule. */
  period: string;
  /** The vendor's original period wording, kept for display/debugging. */
  periodLabel?: string;
  totalAmount: number;
  /** First vencimiento, YYYY-MM-DD. */
  dueDate: string;
  extraordinaryAmount?: number;
  consumption?: Consumption;
  extra?: Record<string, unknown>;
};

export interface VendorParser {
  key: string;
  vendorSlug: string;
  /** Bump on any behavior change; reparse targets bills with older versions. */
  version: number;
  detect(text: string): boolean;
  /** Receives normalized text. Throws ParseError on failure or mismatch. */
  parse(text: string): ParsedBillFields;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public partial?: Partial<ParsedBillFields>,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export interface IQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  searchableFields?: string[];
  sortableFields?: string[];
}

export interface IPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Reusable QueryBuilder for consistent pagination, filtering, sorting and
 * search across all list endpoints. Filters are exact-match equality clauses.
 */
export class QueryBuilder {
  private readonly page: number;
  private readonly limit: number;
  private readonly sortBy: string;
  private readonly sortOrder: "asc" | "desc";
  private readonly search?: string;
  private readonly defaultSortBy: string;
  private searchableFields: string[] = [];
  private sortableFields: string[] = [];
  private readonly filters: Record<string, unknown> = {};

  constructor(query: Record<string, unknown> = {}, options: Partial<IQueryOptions> = {}) {
    const parsedPage = Number.parseInt(String(query.page ?? "1"), 10);
    const parsedLimit = Number.parseInt(
      String(query.limit ?? String(options.limit ?? DEFAULT_LIMIT)),
      10,
    );
    const parsedSortOrder = String(query.sortOrder ?? String(options.sortOrder ?? "desc"));

    this.defaultSortBy = options.sortBy ?? "createdAt";
    this.page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
    this.limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    this.sortBy =
      typeof query.sortBy === "string" && query.sortBy.length > 0
        ? query.sortBy
        : this.defaultSortBy;
    this.sortOrder = parsedSortOrder === "asc" ? "asc" : "desc";
    this.search =
      typeof query.search === "string" && query.search.trim().length > 0
        ? query.search.trim()
        : undefined;

    if (options.searchableFields) this.searchableFields = options.searchableFields;
    if (options.sortableFields) this.sortableFields = options.sortableFields;
  }

  /** Register fields that can be searched with a partial, case-insensitive match. */
  searchable(fields: string[]): this {
    this.searchableFields = fields;
    return this;
  }

  /** Register fields that are safe to ORDER BY (prevents random column injection). */
  sortable(fields: string[]): this {
    this.sortableFields = fields;
    return this;
  }

  /** Add an exact-match equality filter. Empty values are ignored. */
  filter(field: string, value: unknown): this {
    if (value !== undefined && value !== null && value !== "") {
      this.filters[field] = value;
    }
    return this;
  }

  where(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const where: Record<string, unknown> = { isDeleted: false, ...this.filters, ...extra };

    if (this.search && this.searchableFields.length > 0) {
      where.OR = this.searchableFields.map((field) => ({
        [field]: { contains: this.search, mode: "insensitive" },
      }));
    }

    return where;
  }

  orderBy(): Record<string, "asc" | "desc"> {
    const field =
      this.sortableFields.length > 0 && this.sortableFields.includes(this.sortBy)
        ? this.sortBy
        : this.defaultSortBy;
    return { [field]: this.sortOrder };
  }

  pagination(): { skip: number; take: number } {
    return { skip: (this.page - 1) * this.limit, take: this.limit };
  }

  buildMeta(total: number): IPaginationMeta {
    return {
      page: this.page,
      limit: this.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / this.limit),
    };
  }
}

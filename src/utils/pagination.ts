export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  skip: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function getPagination(query: Record<string, unknown>): PaginationOptions {
  const page = Math.max(parseInt(String(query.page ?? DEFAULT_PAGE), 10) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const sortBy = String(query.sortBy ?? "createdAt");
  const sortOrder: "asc" | "desc" = String(query.sortOrder ?? "desc") === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;

  return { page, limit, sortBy, sortOrder, skip };
}

export function buildPrismaOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Record<string, string> {
  return { [sortBy]: sortOrder };
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { items, total, page, limit, totalPages };
}

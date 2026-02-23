/** Standard API success response wrapper */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** Standard API error response */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Paginated response */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

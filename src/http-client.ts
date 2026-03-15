import axios, { AxiosError, type AxiosInstance } from "axios";
import type { ZodType } from "zod";
import { Ok, Err, type Result } from "./result";
import {
  ApiError,
  NetworkError,
  ResponseValidationError,
  type HttpError,
} from "./errors";

export interface HttpClientConfig {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface RequestOptions<T> {
  params?: Record<string, unknown>;
  schema?: ZodType<T>;
  headers?: Record<string, string>;
}

export class HttpClient {
  readonly axios: AxiosInstance;

  constructor(config: HttpClientConfig) {
    this.axios = axios.create({
      baseURL: config.baseURL,
      headers: config.headers,
      timeout: config.timeout,
    });
  }

  async get<T>(
    path: string,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("GET", path, undefined, options);
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("POST", path, body, options);
  }

  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("PUT", path, body, options);
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("PATCH", path, body, options);
  }

  async delete<T>(
    path: string,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    return this.request("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions<T>,
  ): Promise<Result<T, HttpError>> {
    try {
      const response = await this.axios.request({
        method,
        url: path,
        data: body,
        params: options?.params
          ? this.serializeParams(options.params)
          : undefined,
        headers: options?.headers,
      });

      if (options?.schema) {
        const parsed = options.schema.safeParse(response.data);
        if (!parsed.success) {
          return Err(
            new ResponseValidationError({
              zodError: parsed.error,
              endpoint: path,
              rawData: response.data,
            }),
          );
        }
        return Ok(parsed.data);
      }

      return Ok(response.data as T);
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        return Err(
          new ApiError({
            status: error.response.status,
            statusText: error.response.statusText,
            body: error.response.data,
            endpoint: path,
          }),
        );
      }

      return Err(
        new NetworkError({
          cause: error instanceof Error ? error : new Error(String(error)),
          endpoint: path,
        }),
      );
    }
  }

  private serializeParams(
    params: Record<string, unknown>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        result[key] = value.join(",");
      } else {
        result[key] = String(value);
      }
    }
    return result;
  }
}

/**
 * 可续取的列表加载器：后端列表接口是 { items, total, page, size }。
 *
 * - 一次一页往后拉；任何一页失败，已取到的数据保留，游标停在没取到的那页，
 *   再调 resume()/retry() 只重发这一页，实现「从断掉的那次接着取」；
 * - 加载中的同一页并发自动合并（client 的 GET dedupe + 游标判断双保险）；
 * - 查询条件变化用 reset(query) 回到第一页重新拉。
 */
import { fetchJson } from './client'
import { ApiError } from './errors'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface ResumeOptions {
  pageSize?: number
  /** 把当前页码/每页条数拼进查询参数之外的附加参数（如筛选条件）。 */
  query?: Record<string, string | number | undefined | null>
  signal?: AbortSignal
}

export class ResumableList<T> {
  private readonly endpoint: string
  private pageSize: number
  private query: Record<string, string | number | undefined | null>
  private nextPage = 1
  private fetchedPages = 0
  private total = 0
  private items: T[] = []
  private lastError: ApiError | null = null
  private loading: Promise<Page<T>> | null = null

  constructor(endpoint: string, options: ResumeOptions = {}) {
    this.endpoint = endpoint
    this.pageSize = options.pageSize ?? 20
    this.query = { ...(options.query ?? {}) }
  }

  private buildUrl(page: number): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(this.query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    }
    params.set('page', String(page))
    params.set('size', String(this.pageSize))
    const qs = params.toString()
    return qs ? `${this.endpoint}?${qs}` : this.endpoint
  }

  private async pull(page: number, signal?: AbortSignal): Promise<Page<T>> {
    const data = await fetchJson<Page<T>>(this.buildUrl(page), { signal })
    return {
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === 'number' ? data.total : 0,
      page: typeof data.page === 'number' ? data.page : page,
      size: typeof data.size === 'number' ? data.size : this.pageSize,
    }
  }

  /** 拉取下一页（游标所在页）。并发调用只发一次请求，复用同一个 Promise。 */
  loadNext(signal?: AbortSignal): Promise<Page<T>> {
    if (this.loading) return this.loading
    const page = this.nextPage
    const task = this.pull(page, signal)
      .then((result) => {
        this.items = page === 1 ? result.items : [...this.items, ...result.items]
        this.total = result.total
        this.fetchedPages += 1
        this.nextPage = result.page + 1
        this.lastError = null
        return result
      })
      .catch((error: unknown) => {
        // 游标不动：下次还是这一页，已取到的前几页原样保留
        this.lastError = error instanceof ApiError ? error : (error as ApiError)
        throw error
      })
      .finally(() => {
        this.loading = null
      })
    this.loading = task
    return task
  }

  /** 失败后续取：只发断掉的那一页。成功返回新到的这一页数据。 */
  resume(signal?: AbortSignal): Promise<Page<T>> {
    return this.loadNext(signal)
  }

  /** 同 resume，语义化别名，供页面「重试」按钮调用。 */
  retry(signal?: AbortSignal): Promise<Page<T>> {
    return this.loadNext(signal)
  }

  /** 查询条件变化：丢弃游标从头拉，已显示数据先保留直到新首页成功。 */
  reset(query?: Record<string, string | number | undefined | null>, pageSize?: number): Promise<Page<T>> {
    this.query = { ...(query ?? this.query) }
    if (pageSize) this.pageSize = pageSize
    this.nextPage = 1
    this.fetchedPages = 0
    this.total = 0
    this.items = []
    this.lastError = null
    return this.loadNext()
  }

  /** 一次拉完所有页：某页失败时可随后 resume 接着拉。 */
  async loadAll(signal?: AbortSignal): Promise<T[]> {
    do {
      await this.loadNext(signal)
    } while (this.hasNext())
    return this.items
  }

  /**
   * 是否还有没取到的页：按后端分页口径（已取页数 × 每页条数 < 总数）。
   * 不能用已取条数比较，因为每页实际条数可能小于 size。
   */
  hasNext(): boolean {
    return this.fetchedPages * this.pageSize < this.total
  }

  get state(): { items: T[]; total: number; page: number; error: ApiError | null; loading: boolean } {
    return {
      items: this.items,
      total: this.total,
      page: this.nextPage,
      error: this.lastError,
      loading: this.loading !== null,
    }
  }
}

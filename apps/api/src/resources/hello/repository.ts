import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export declare namespace HelloRepository {
  export type Hello = InferOutput<typeof schema.SHelloBase>
  export type HelloRecord = Omit<Hello, 'createdAt'> & { createdAt: Date }

  export interface FindManyOptions {
    offset: number
    limit: number
    nameFilter?: string | undefined
  }

  export interface FindManyResult {
    items: Hello[]
    nextOffset: number | null
    hasMore: boolean
    totalCount: number
  }
}

export interface HelloRepository {
  findById(id: string): Promise<HelloRepository.Hello | undefined>
  findOwnerId(id: string): Promise<string | undefined>
  findMany(options: HelloRepository.FindManyOptions): Promise<HelloRepository.FindManyResult>
  insert(record: HelloRepository.HelloRecord): Promise<HelloRepository.Hello>
  deleteById(id: string, ownerId: string): Promise<boolean>
}

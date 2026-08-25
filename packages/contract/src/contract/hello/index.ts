import { create } from './command/create.ts'
import { remove } from './command/remove.ts'
import { get } from './query/get.ts'
import { list } from './query/list.ts'
import { world } from './query/world.ts'

export const hello = { list, get, world, create, remove }
